import { describe, expect, it } from 'vitest';
import { isMeetUrl, normaliseMeetUrl, isWhatsappGroupUrl, jitsiUrl, makeCallRoom, normaliseWhatsappGroupUrl, CALL_ROOM_RE } from './call';

describe('video call helpers', () => {
  it('makes a URL-safe room id', () => {
    const r = makeCallRoom(() => 'ab12-cd34-ef56-gh78-ij90-kl');
    expect(r).toBe('trip-ab12cd34ef56gh78ij90');
    expect(CALL_ROOM_RE.test(r)).toBe(true);
  });
  it('builds a Jitsi link with the name pre-filled', () => {
    const u = jitsiUrl('trip-abc', 'Asha "Test"');
    expect(u.startsWith('https://meet.jit.si/trip-abc#userInfo.displayName=')).toBe(true);
    expect(decodeURIComponent(u.split('displayName=')[1].split('&')[0])).toBe('"Asha \\"Test\\""');
    expect(u).toContain('config.prejoinPageEnabled=true');
  });
  it('validates WhatsApp group invite links', () => {
    expect(isWhatsappGroupUrl('https://chat.whatsapp.com/AbCdEf123456')).toBe(true);
    expect(isWhatsappGroupUrl(' https://chat.whatsapp.com/AbCdEf123456/?mode=r_c ')).toBe(true);
    expect(normaliseWhatsappGroupUrl('http://chat.whatsapp.com/Abc/')).toBe('https://chat.whatsapp.com/Abc');
    expect(normaliseWhatsappGroupUrl('Follow this link to join my WhatsApp group: https://chat.whatsapp.com/AbC123xyz')).toBe('https://chat.whatsapp.com/AbC123xyz');
    expect(normaliseWhatsappGroupUrl('https://chat.whatsapp.com/invite/AbC123')).toBe('https://chat.whatsapp.com/AbC123');
    expect(normaliseWhatsappGroupUrl('chat.whatsapp.com/AbC123?mode=wwt')).toBe('https://chat.whatsapp.com/AbC123');
    expect(isWhatsappGroupUrl('Join: https://chat.whatsapp.com/AbC123 thanks')).toBe(true);
    expect(isWhatsappGroupUrl('https://wa.me/919876543210')).toBe(false);
    expect(isWhatsappGroupUrl('https://chat.whatsapp.com/')).toBe(false);
    expect(isWhatsappGroupUrl('just some text')).toBe(false);
  });
  it('validates Google Meet links', () => {
    expect(normaliseMeetUrl('Join with Google Meet: https://meet.google.com/abc-defg-hij?authuser=0')).toBe('https://meet.google.com/abc-defg-hij');
    expect(normaliseMeetUrl('meet.google.com/ABC-DEFG-HIJ')).toBe('https://meet.google.com/abc-defg-hij');
    expect(isMeetUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isMeetUrl('https://meet.google.com/new')).toBe(false);
    expect(isMeetUrl('https://zoom.us/j/123')).toBe(false);
  });
});
