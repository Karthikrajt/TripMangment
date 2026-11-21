/**
 * Admin-managed shared content: itinerary, accommodation, rooms, transport,
 * announcements. All writes are also enforced by firestore.rules.
 */
import { addDoc, deleteDoc, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { tripCol, tripDoc, logAudit, notify, strip } from './base';
import { newId } from '../lib/ids';
import { deleteFile } from '../lib/files';
import type { Accommodation, Announcement, ItineraryItem, NotificationType, Room, Vehicle } from '../domain/types';

type WithoutMeta<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

interface EntityConfig {
  collection: string;
  entity: string;
  notifyType: NotificationType;
  link: string;
  label: (d: Record<string, unknown>) => string;
}

function makeCrud<T extends { id: string }>(cfg: EntityConfig) {
  return {
    async save(input: WithoutMeta<T>, before: T | null, opts: { silent?: boolean } = {}): Promise<string> {
      const id = before?.id ?? newId();
      const data: DocumentData = { ...input, updatedAt: serverTimestamp() };
      if (before) await updateDoc(tripDoc(cfg.collection, id), data);
      else await setDoc(tripDoc(cfg.collection, id), { ...data, createdAt: serverTimestamp() });
      const name = cfg.label(input as Record<string, unknown>);
      await logAudit(before ? 'update' : 'create', cfg.entity, id, `${before ? 'Updated' : 'Added'} ${cfg.entity} “${name}”`, before ? strip(before as never) : null, input as never);
      if (!opts.silent) {
        await notify({ type: cfg.notifyType, title: `${cfg.entity[0].toUpperCase()}${cfg.entity.slice(1)} ${before ? 'updated' : 'added'}`, body: name, link: cfg.link, target: 'all' });
      }
      return id;
    },
    async remove(item: T, opts: { silent?: boolean; filePath?: string } = {}) {
      await deleteDoc(tripDoc(cfg.collection, item.id));
      if (opts.filePath) await deleteFile(opts.filePath).catch(() => undefined);
      const name = cfg.label(item as unknown as Record<string, unknown>);
      await logAudit('delete', cfg.entity, item.id, `Deleted ${cfg.entity} “${name}”`, strip(item as never), null);
      if (!opts.silent) await notify({ type: cfg.notifyType, title: `${cfg.entity[0].toUpperCase()}${cfg.entity.slice(1)} removed`, body: name, link: cfg.link, target: 'all' });
    },
  };
}

export const itineraryService = makeCrud<ItineraryItem>({
  collection: 'itinerary',
  entity: 'itinerary item',
  notifyType: 'itinerary_changed',
  link: '/itinerary',
  label: (d) => `Day ${d.dayNumber}: ${d.title}`,
});

export const accommodationService = makeCrud<Accommodation>({
  collection: 'accommodations',
  entity: 'hotel',
  notifyType: 'hotel_changed',
  link: '/accommodation',
  label: (d) => String(d.name),
});

export const roomService = makeCrud<Room>({
  collection: 'rooms',
  entity: 'room allocation',
  notifyType: 'room_updated',
  link: '/rooms',
  label: (d) => String(d.name),
});

export const transportService = makeCrud<Vehicle>({
  collection: 'transport',
  entity: 'vehicle',
  notifyType: 'transport_updated',
  link: '/transport',
  label: (d) => `${d.vehicleType} ${d.registrationNumber ?? ''}`.trim(),
});

export async function postAnnouncement(input: { title: string; body: string; priority: 'normal' | 'important' }, by: { uid: string; name: string; photo: string }) {
  const ref = await addDoc(tripCol('announcements'), {
    title: input.title.trim().slice(0, 150),
    body: input.body.trim().slice(0, 3000),
    priority: input.priority,
    createdBy: by.uid,
    createdByName: by.name,
    createdAt: serverTimestamp(),
  });
  // Mirror into the group chat so everyone sees it in context.
  await addDoc(tripCol('messages'), {
    senderUid: by.uid,
    senderName: by.name,
    senderPhoto: by.photo,
    text: `📢 ${input.title.trim()}\n${input.body.trim()}`.slice(0, 2000),
    kind: 'announcement',
    filePath: '',
    fileName: '',
    fileType: '',
    createdAt: serverTimestamp(),
  });
  await logAudit('create', 'announcement', ref.id, `Posted announcement “${input.title}”`);
  await notify({ type: 'announcement', title: `📢 ${input.title}`, body: input.body.slice(0, 200), link: '/announcements', target: 'all' });
}

export async function deleteAnnouncement(a: Announcement) {
  await deleteDoc(tripDoc('announcements', a.id));
  await logAudit('delete', 'announcement', a.id, `Deleted announcement “${a.title}”`, strip(a as never), null);
}
