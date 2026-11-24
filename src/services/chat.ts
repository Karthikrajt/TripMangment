import { addDoc, deleteDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, type Timestamp } from 'firebase/firestore';
import { tripCol, tripDoc, notify } from './base';
import { deleteFile, type UploadedFile } from '../lib/files';
import type { ChatMessage } from '../domain/types';
import { CHAT_PAGE_SIZE } from '../config/constants';
import { writeOrQueue } from '../lib/offlineQueue';

let lastPush = 0;

export async function sendMessage(text: string, by: { uid: string; name: string; photo: string }, file: UploadedFile | null) {
  const kind = file ? (file.fileType.startsWith('image/') ? 'image' : 'file') : 'text';
  // Offline: shown immediately as "sending…" and delivered when back online.
  await writeOrQueue(addDoc(tripCol('messages'), {
    senderUid: by.uid,
    senderName: by.name.slice(0, 100),
    senderPhoto: by.photo,
    text: text.trim().slice(0, 2000),
    kind,
    filePath: file?.path ?? '',
    fileName: file?.fileName ?? '',
    fileType: file?.fileType ?? '',
    createdAt: serverTimestamp(),
  }));
  // Throttle chat push notifications to at most one per sender per 2 minutes.
  if (Date.now() - lastPush > 120_000) {
    lastPush = Date.now();
    await notify({ type: 'chat_message', title: `New message from ${by.name}`, body: text.trim().slice(0, 120) || (file ? '📎 Attachment' : ''), link: '/chat', target: 'all' });
  }
}

export async function deleteMessage(m: ChatMessage) {
  if (m.filePath) await deleteFile(m.filePath).catch(() => undefined);
  await deleteDoc(tripDoc('messages', m.id));
}

/** Page backwards from the oldest loaded message's timestamp. */
export async function loadOlder(cursor: Timestamp) {
  const snap = await getDocs(query(tripCol('messages'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(CHAT_PAGE_SIZE)));
  return snap;
}
