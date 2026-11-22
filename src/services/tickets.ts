import { deleteDoc, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { tripDoc, logAudit, notify, strip } from './base';
import { newId } from '../lib/ids';
import { deleteFile, type UploadedFile } from '../lib/files';
import type { Ticket } from '../domain/types';

export type TicketInput = Pick<
  Ticket,
  | 'title' | 'pnr' | 'trainName' | 'trainNumber' | 'journeyDate' | 'boardingStation' | 'destinationStation'
  | 'departureTime' | 'arrivalTime' | 'passengerNames' | 'passengerUids' | 'coach' | 'seats' | 'travelClass' | 'notes'
> & Pick<Ticket, 'passengers'>;

export async function createTicket(input: TicketInput, file: UploadedFile, by: { uid: string; name: string }): Promise<string> {
  const id = newId();
  try {
    await setDoc(tripDoc('tickets', id), {
      ...input,
      filePath: file.path,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      uploadedBy: by.uid,
      uploadedByName: by.name,
      locked: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    await deleteFile(file.path).catch(() => undefined); // don't leave an orphan
    throw e;
  }
  await logAudit('create', 'ticket', id, `Uploaded ticket “${input.title}” (PNR ${input.pnr || '—'})`, null, input as never);
  await notify({ type: 'ticket_uploaded', title: 'New train ticket uploaded', body: `${by.name} uploaded “${input.title}”`, link: `/tickets?open=${id}`, target: 'all' });
  return id;
}

/** Update details and optionally replace the document. Old file is deleted after a successful save. */
export async function updateTicket(before: Ticket, input: TicketInput, replacement: UploadedFile | null): Promise<void> {
  const data: DocumentData = { ...input, updatedAt: serverTimestamp() };
  if (replacement) Object.assign(data, { filePath: replacement.path, fileName: replacement.fileName, fileType: replacement.fileType, fileSize: replacement.fileSize });
  try {
    await updateDoc(tripDoc('tickets', before.id), data);
  } catch (e) {
    if (replacement) await deleteFile(replacement.path).catch(() => undefined);
    throw e;
  }
  if (replacement) await deleteFile(before.filePath).catch(() => undefined);
  await logAudit('update', 'ticket', before.id, `Updated ticket “${input.title}”${replacement ? ' (document replaced)' : ''}`, strip(before as never), data);
  await notify({ type: 'ticket_updated', title: 'Ticket details updated', body: `“${input.title}” was updated`, link: `/tickets?open=${before.id}`, target: 'all' });
}

export async function setTicketLock(t: Ticket, locked: boolean) {
  await updateDoc(tripDoc('tickets', t.id), { locked, updatedAt: serverTimestamp() });
  await logAudit(locked ? 'lock' : 'unlock', 'ticket', t.id, `${locked ? 'Locked' : 'Unlocked'} ticket “${t.title}”`);
}

export async function deleteTicket(t: Ticket) {
  // Delete the file first while the record still proves ownership to the Edge Function.
  await deleteFile(t.filePath).catch(() => undefined);
  await deleteDoc(tripDoc('tickets', t.id));
  await logAudit('delete', 'ticket', t.id, `Deleted ticket “${t.title}” (PNR ${t.pnr || '—'})`, strip(t as never), null);
}
