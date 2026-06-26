// Room model — fire-and-forget Mongo persistence.
// Story 1.6. Authoritative state lives in lib/game/roomRegistry RAM (D-2);
// this Mongo doc is for admin observability + audit replay.

const { mongoose } = require('../lib/db.js');

const ROOM_STATES = [
  'ROOM_CREATED',
  'WAITING_FOR_PLAYERS',
  'LOBBY',
  'READY_CHECK',
  'MATCH_STARTING',
  'MATCH_IN_PROGRESS',
  'BETWEEN_MATCHES',
  'ROOM_PAUSED',
  'ROOM_COMPLETED',
  'ROOM_CANCELLED',
  'ROOM_EXPIRED'
];

const RoomSettingsSchema = new mongoose.Schema(
  {
    categoryMode: {
      type: String,
      enum: ['RANDOM', 'HOST_SELECTED', 'PLAYER_VOTE'],
      default: 'RANDOM'
    },
    promptDuration: { type: Number, default: 60 },
    votingDuration: { type: Number, default: 15 },
    audienceEnabled: { type: Boolean, default: true },
    aiScoreEnabled: { type: Boolean, default: true },
    showPromptsAfterResult: { type: Boolean, default: true },
    showPromptsDuringWriting: { type: Boolean, default: false },
    rematchEnabled: { type: Boolean, default: true },
    audienceVotingEnabled: { type: Boolean, default: false }, // D-1: opt-in
    roomMode: { type: String, enum: ['DUEL', 'TOURNAMENT'], default: 'DUEL' },
    tournamentMode: { type: String, enum: ['A', 'B'], default: 'A' }
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema(
  {
    _id: { type: String }, // roomId
    roomCode: { type: String, required: true, unique: true, index: true },
    roomName: { type: String, default: '' },
    hostId: { type: String, required: true, index: true },
    type: { type: String, enum: ['PRIVATE'], default: 'PRIVATE' },
    state: { type: String, enum: ROOM_STATES, default: 'WAITING_FOR_PLAYERS', index: true },
    settings: { type: RoomSettingsSchema, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    closedAt: { type: Date }
  },
  { versionKey: false, _id: false }
);

RoomSchema.index({ hostId: 1, state: 1 });

const Room = mongoose.models.Room || mongoose.model('Room', RoomSchema);

// Fire-and-forget create. Returns the promise but callers should `.catch(()=>{})`.
async function saveRoom(doc) {
  try {
    return await Room.create(doc);
  } catch (err) {
    console.warn('[room] mongo save failed:', err.message);
    return null;
  }
}

async function updateRoomState(roomId, patch) {
  try {
    return await Room.findByIdAndUpdate(
      roomId,
      { ...patch, updatedAt: new Date() },
      { new: true }
    ).lean();
  } catch (err) {
    console.warn('[room] mongo update failed:', err.message);
    return null;
  }
}

module.exports = { Room, ROOM_STATES, saveRoom, updateRoomState };
