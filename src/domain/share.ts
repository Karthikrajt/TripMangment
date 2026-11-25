/**
 * Plain-text summaries for sharing on WhatsApp (or any app). Only builds
 * strings; nothing leaves the phone until the user taps Send in WhatsApp.
 */
import type { ItineraryItem, Ticket, TicketPassenger, Vehicle, Accommodation } from './types';
import { berthLabel } from './ticketPassengers';
import { formatDate, formatDateLong, formatTime } from '../lib/format';

/** wa.me link that opens WhatsApp with the text ready; the user picks the chat. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text.slice(0, 3500))}`;
}

const timeRange = (a: string, b: string) => [formatTime(a), formatTime(b)].filter(Boolean).join(' – ');

export function dayPlanText(tripName: string, date: string, items: ItineraryItem[]): string {
  const lines = [`*${tripName} – ${formatDateLong(date)}*`];
  const day = items.find((i) => i.dayNumber)?.dayNumber;
  if (day) lines[0] += ` (Day ${day})`;
  if (!items.length) lines.push('Nothing planned.');
  for (const i of items) {
    const t = timeRange(i.startTime, i.endTime);
    lines.push(`${t ? `🕒 ${t} – ` : '• '}${i.title}`);
    if (i.location) lines.push(`   📍 ${i.location}`);
    if (i.instructions) lines.push(`   ⚠️ ${i.instructions}`);
    if (i.mapsUrl) lines.push(`   ${i.mapsUrl}`);
  }
  return lines.join('\n');
}

export function ticketText(t: Ticket, passengers: TicketPassenger[]): string {
  const lines = [
    `🚆 *${[t.trainName, t.trainNumber && `#${t.trainNumber}`].filter(Boolean).join(' ') || t.title}*`,
    `${t.boardingStation} → ${t.destinationStation}`,
    `📅 ${formatDate(t.journeyDate)}${t.departureTime ? ` · Departs ${formatTime(t.departureTime)}` : ''}${t.arrivalTime ? ` · Arrives ${formatTime(t.arrivalTime)}` : ''}`,
  ];
  if (t.pnr) lines.push(`PNR: ${t.pnr}${t.travelClass ? ` · ${t.travelClass}` : ''}`);
  if (passengers.length) {
    lines.push('', '*Passengers*');
    passengers.forEach((p, n) => lines.push(`${n + 1}. ${p.name || 'Passenger'} – ${berthLabel(p) || 'berth not given'}${p.status ? ` (${p.status})` : ''}`));
  }
  return lines.join('\n');
}

export function pickupText(v: Vehicle, people: string[]): string {
  const lines = [
    `🚌 *Pickup – ${[v.vehicleType, v.registrationNumber].filter(Boolean).join(' ')}*`,
    `📅 ${formatDate(v.pickupDate)}${v.pickupTime ? ` at *${formatTime(v.pickupTime)}*` : ''}`,
  ];
  if (v.pickupLocation) lines.push(`📍 ${v.pickupLocation}`);
  if (v.mapsUrl) lines.push(v.mapsUrl);
  if (v.destination) lines.push(`➡️ To ${v.destination}`);
  if (v.driverName || v.driverPhone) lines.push(`Driver: ${[v.driverName, v.driverPhone].filter(Boolean).join(' – ')}`);
  if (v.instructions) lines.push(`⚠️ ${v.instructions}`);
  if (people.length) lines.push('', `*In this vehicle (${people.length})*: ${people.join(', ')}`);
  return lines.join('\n');
}

export function liveText(opts: { tripName: string; date: string; items: ItineraryItem[]; hotel?: Accommodation; vehicle?: Vehicle; emergency?: string }): string {
  const parts = [dayPlanText(opts.tripName, opts.date, opts.items)];
  if (opts.vehicle) parts.push(`🚌 Pickup ${formatDate(opts.vehicle.pickupDate)} ${formatTime(opts.vehicle.pickupTime)} – ${opts.vehicle.pickupLocation}${opts.vehicle.driverPhone ? ` (driver ${opts.vehicle.driverPhone})` : ''}`);
  if (opts.hotel) parts.push(`🏨 ${opts.hotel.name}${opts.hotel.address ? `, ${opts.hotel.address}` : ''}${opts.hotel.contactNumber ? ` – ${opts.hotel.contactNumber}` : ''}`);
  if (opts.emergency) parts.push(`🆘 ${opts.emergency}`);
  return parts.join('\n\n');
}
