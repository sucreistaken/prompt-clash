// /create-room — Story 1.8. Server component owns metadata + SEO.
// Form body lives in CreateRoomFormClient.tsx.

import type { Metadata } from 'next';
import { CreateRoomFormClient } from './CreateRoomFormClient';
import { CATEGORIES } from '@/lib/game/targetPrompt.js';

export const metadata: Metadata = {
  title: 'Yeni Oda · Prompt Clash',
  description:
    'Özel maç odanı saniyeler içinde oluştur. QR ile arkadaşlarınla paylaş, AI senin için çizsin.',
  robots: { index: false }
};

export default function CreateRoomPage() {
  const categories = (CATEGORIES as Array<{ code: string; labelTr: string }>).map((c) => ({
    code: c.code,
    labelTr: c.labelTr
  }));
  return <CreateRoomFormClient categories={categories} />;
}
