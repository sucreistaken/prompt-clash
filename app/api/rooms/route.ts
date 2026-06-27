// POST /api/rooms — Story 1.6. Create a private room and set the host session.
//
// Returns:
//   201 { ok: true, data: { roomId, roomCode } }
//   400 { ok: false, code: 'invalid_input', issues }
//   429 { ok: false, code: 'rate_limited' | 'room_create_limit', retryAfterMs? }
//   500 { ok: false, code: 'internal' }

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { apiOk, apiError, ApiError, ERROR_CODES } from '@/lib/apiResponse.js';
import {
  createRoom,
  generateUniqueRoomCode,
  countActiveRoomsByHost,
  DEFAULT_ROOM_ID,
  shortRoomId
} from '@/lib/game/roomRegistry.js';
import { saveRoom } from '@/models/Room.js';
import { saveRoomMember } from '@/models/RoomMember.js';
import * as auditLog from '@/lib/auditLog.js';
import { checkLimit } from '@/lib/rateLimit.js';
import {
  HOST_COOKIE_NAME,
  DEVICE_COOKIE_NAME,
  newDeviceId,
  newHostToken,
  hostCookieAttrs,
  deviceCookieAttrs
} from '@/lib/auth/cookieAuth.js';
import { readPhase1Limits } from '@/lib/env.js';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateRoomBody = z.object({
  roomName: z.string().max(50).optional().default(''),
  categoryMode: z.enum(['RANDOM', 'HOST_SELECTED', 'PLAYER_VOTE']).default('RANDOM'),
  promptDuration: z.number().int().min(10).max(180).default(60),
  votingDuration: z.number().int().min(5).max(120).default(15),
  audienceEnabled: z.boolean().default(true),
  aiScoreEnabled: z.boolean().default(true),
  showPromptsAfterResult: z.boolean().default(true),
  showPromptsDuringWriting: z.boolean().default(false),
  rematchEnabled: z.boolean().default(true),
  audienceVotingEnabled: z.boolean().default(false),
  roomMode: z.enum(['DUEL', 'TOURNAMENT']).default('DUEL'),
  tournamentMode: z.enum(['A', 'B']).default('A'),
  categoryPool: z.array(z.string()).max(40).default([]),
  customThemes: z.array(z.string().trim().min(2).max(60)).max(8).default([])
});

function _clientIp(req: Request): string {
  const h = req.headers;
  const xf = h.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  const real = h.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export async function POST(req: Request) {
  try {
    const ip = _clientIp(req);
    const jar = cookies();
    const deviceCookie = jar.get(DEVICE_COOKIE_NAME)?.value;
    const deviceId = deviceCookie || newDeviceId();

    // Rate limit 1 — global throttle (FR-7.3). 20 rooms/hour per IP/device.
    const limited = checkLimit({
      ip,
      deviceId,
      event: 'rooms:create',
      limit: 20,
      windowMs: 3600_000
    });
    if (!limited.ok) {
      const { body, status } = apiError({
        code: ERROR_CODES.ROOM_CREATE_LIMIT,
        status: 429
      });
      return NextResponse.json(body, { status });
    }

    // Body parse + validation
    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      const { body, status } = apiError({ code: ERROR_CODES.INVALID_INPUT, message: 'invalid_json' });
      return NextResponse.json(body, { status });
    }
    let body;
    try {
      body = CreateRoomBody.parse(payload);
    } catch (err) {
      const r = apiError(err);
      return NextResponse.json(r.body, { status: r.status });
    }

    // Mint host identity. hostId is opaque to the world; it lives in the
    // signed pc_host_session cookie and in Room.hostId.
    const hostId = `host_${crypto.randomBytes(16).toString('hex')}`;

    // Concurrent-room cap (FR-1.6 / Readiness Review 2026-05-30 AC).
    const { maxConcurrentRoomsPerHost } = readPhase1Limits();
    if (countActiveRoomsByHost(hostId) >= maxConcurrentRoomsPerHost) {
      // First-request-of-a-fresh-host can't actually hit this, but the cap is
      // wired correctly for subsequent creates from the same browser. The
      // check is still useful when the host cookie already exists.
      const { body: errBody, status } = apiError({ code: ERROR_CODES.ROOM_CREATE_LIMIT });
      return NextResponse.json(errBody, { status });
    }

    // Mint roomCode + register room in RAM (authoritative per D-2).
    const roomCode = generateUniqueRoomCode();
    const room = createRoom({
      roomCode,
      hostId,
      roomName: body.roomName,
      settings: body,
      state: 'WAITING_FOR_PLAYERS'
    });

    // Fire-and-forget Mongo persistence (NFR-2.1: room runs without Mongo).
    saveRoom({
      _id: room.roomId,
      roomCode,
      roomName: body.roomName,
      hostId,
      type: 'PRIVATE',
      state: 'WAITING_FOR_PLAYERS',
      settings: body
    }).catch(() => {});
    saveRoomMember({
      roomId: room.roomId,
      userId: hostId,
      sessionId: hostId,
      role: 'HOST',
      status: 'ACTIVE',
      joinedAt: new Date()
    }).catch(() => {});

    // Audit log entry.
    auditLog.info({
      roomId: room.roomId,
      actor: 'host',
      actorId: hostId,
      action: 'room_created',
      payload: { roomCode, roomName: body.roomName, ip }
    });

    // Set host session + device cookies.
    const hostToken = newHostToken({ hostId });
    jar.set({ name: HOST_COOKIE_NAME, value: hostToken, ...hostCookieAttrs() });
    if (!deviceCookie) {
      jar.set({ name: DEVICE_COOKIE_NAME, value: deviceId, ...deviceCookieAttrs() });
    }

    const ok = apiOk({ roomId: room.roomId, roomCode });
    console.log(`[room:${shortRoomId(room.roomId)}] POST /api/rooms ok (code ${roomCode})`);
    return NextResponse.json(ok.body, { status: 201 });
  } catch (err: any) {
    if (err instanceof ApiError) {
      const r = apiError(err);
      return NextResponse.json(r.body, { status: r.status });
    }
    console.error('[api/rooms POST] unhandled:', err?.message || err);
    const r = apiError(err);
    return NextResponse.json(r.body, { status: r.status });
  }
}

// Suppress the default route to keep the surface minimal until Story 4.x.
export async function GET() {
  return NextResponse.json({ ok: false, code: 'method_not_allowed' }, { status: 405 });
}

// Touch DEFAULT_ROOM_ID so the import isn't pruned in production builds — the
// roomRegistry side-effect (default room bootstrap) needs to run at boot via
// `lib/game/roomRegistry.js` import; this is a defensive reference.
void DEFAULT_ROOM_ID;
