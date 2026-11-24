import { describe, expect, it } from 'vitest';
import { dayPlanText, pickupText, ticketText, whatsappShareUrl } from './share';
import type { ItineraryItem, Ticket, Vehicle } from './types';

describe('share text', () => {
  it('builds a wa.me link', () => {
    expect(whatsappShareUrl('Hi & bye')).toBe('https://wa.me/?text=Hi%20%26%20bye');
  });
  it('day plan', () => {
    const t = dayPlanText('Test Trip', '2026-12-20', [{ dayNumber: 2, startTime: '08:00', endTime: '09:00', title: 'Breakfast', location: 'Hotel', instructions: '', mapsUrl: '' } as ItineraryItem]);
    expect(t).toContain('*Test Trip – ');
    expect(t).toContain('(Day 2)');
    expect(t).toContain('🕒 8:00 AM – 9:00 AM – Breakfast');
    expect(t).toContain('📍 Hotel');
  });
  it('ticket with passengers', () => {
    const t = ticketText({ trainName: 'Test Express', trainNumber: '12345', boardingStation: 'AAA', destinationStation: 'BBB', journeyDate: '2026-12-20', departureTime: '21:30', arrivalTime: '', pnr: '1234567890', travelClass: '3A' } as Ticket, [
      { personId: '', name: 'Asha', age: 30, gender: 'F', coach: 'B2', berth: '12', berthType: 'LB', status: 'CNF' },
    ]);
    expect(t).toContain('Test Express #12345');
    expect(t).toContain('20-12-2026 · Departs 9:30 PM');
    expect(t).toContain('PNR: 1234567890 · 3A');
    expect(t).toMatch(/1\. Asha – B2.*12.*\(CNF\)/);
  });
  it('pickup', () => {
    const t = pickupText({ vehicleType: 'Tempo', registrationNumber: 'XX 01', pickupDate: '2026-12-21', pickupTime: '09:30', pickupLocation: 'Gate', mapsUrl: '', destination: 'Falls', driverName: 'Driver', driverPhone: '9000000000', instructions: '' } as Vehicle, ['A', 'B']);
    expect(t).toContain('21-12-2026 at *9:30 AM*');
    expect(t).toContain('Driver: Driver – 9000000000');
    expect(t).toContain('(2)*: A, B');
  });
});
