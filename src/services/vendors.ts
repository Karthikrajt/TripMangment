import { deleteDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { tripDoc, logAudit, notify, strip } from './base';
import { newId } from '../lib/ids';
import { formatINR } from '../domain/money';
import { STATUS_LABELS, type VendorInput } from '../domain/vendors';
import type { Vendor, VendorStatus } from '../domain/types';

function clean(v: VendorInput): VendorInput {
  return {
    ...v,
    name: v.name.trim().slice(0, 150),
    contactPerson: v.contactPerson.trim().slice(0, 100),
    phone: v.phone.trim().slice(0, 30),
    altPhone: v.altPhone.trim().slice(0, 30),
    email: v.email.trim().toLowerCase().slice(0, 200),
    website: v.website.trim().slice(0, 500),
    location: v.location.trim().slice(0, 300),
    mapsUrl: v.mapsUrl.trim().slice(0, 1000),
    quoteNote: v.quoteNote.trim().slice(0, 300),
    notes: v.notes.trim().slice(0, 3000),
  };
}

async function announceBooked(name: string, quotePaise: number) {
  await notify({ type: 'hotel_changed', title: 'Booked', body: `${name}${quotePaise ? ` – ${formatINR(quotePaise)}` : ''}`, link: '/vendors', target: 'all' });
}

export async function saveVendor(input: VendorInput, before: Vendor | null, by: { uid: string; name: string }): Promise<string> {
  const data = clean(input);
  if (before) {
    await updateDoc(tripDoc('vendors', before.id), { ...data, updatedAt: serverTimestamp() });
    await logAudit('update', 'vendor', before.id, `Updated “${data.name}” (${STATUS_LABELS[data.status]})`, strip(before as never), data as never);
    if (data.status === 'booked' && before.status !== 'booked') await announceBooked(data.name, data.quotePaise);
    return before.id;
  }
  const id = newId();
  await setDoc(tripDoc('vendors', id), { ...data, createdBy: by.uid, createdByName: by.name.slice(0, 100), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logAudit('create', 'vendor', id, `Added “${data.name}” (${STATUS_LABELS[data.status]})`, null, data as never);
  if (data.status === 'booked') await announceBooked(data.name, data.quotePaise);
  return id;
}

export async function setVendorStatus(v: Vendor, status: VendorStatus) {
  if (v.status === status) return;
  await updateDoc(tripDoc('vendors', v.id), { status, updatedAt: serverTimestamp() });
  await logAudit('update', 'vendor', v.id, `“${v.name}”: ${STATUS_LABELS[v.status]} → ${STATUS_LABELS[status]}`, { status: v.status }, { status });
  if (status === 'booked') await announceBooked(v.name, v.quotePaise);
}

export async function deleteVendor(v: Vendor) {
  await deleteDoc(tripDoc('vendors', v.id));
  await logAudit('delete', 'vendor', v.id, `Deleted “${v.name}”`, strip(v as never), null);
}
