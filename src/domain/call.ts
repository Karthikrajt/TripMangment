/**
 * Free video calls. The app never carries audio/video itself:
 * - Jitsi Meet (meet.jit.si): a private room named by a random id stored on the trip
 * - the family's WhatsApp group (group video call inside WhatsApp)
 */

/** Room ids: "trip-" + 20 random letters/digits – hard to guess, valid in a URL. */
export const CALL_ROOM_RE = /^[A-Za-z0-9-]{1,64}$/;
export const WHATSAPP_GROUP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/;

export function makeCallRoom(random: () => string): string {
  return 'trip-' + random().replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
}

/** Jitsi link that opens the pre-join screen with the person's name filled in. */
export function jitsiUrl(room: string, displayName: string): string {
  const name = encodeURIComponent(JSON.stringify(displayName.slice(0, 60)));
  return `https://meet.jit.si/${encodeURIComponent(room)}#userInfo.displayName=${name}&config.prejoinPageEnabled=true`;
}

/**
 * Accepts the invite link however WhatsApp copies it: the bare link, the
 * whole "Follow this link to join my WhatsApp group: …" sentence, an
 * /invite/ path, a query string or a trailing slash. Returns
 * https://chat.whatsapp.com/<code>, or the trimmed input if no link is found.
 */
export function normaliseWhatsappGroupUrl(v: string): string {
  const m = /(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i.exec(v);
  return m ? `https://chat.whatsapp.com/${m[1]}` : v.trim();
}

export function isWhatsappGroupUrl(v: string): boolean {
  return WHATSAPP_GROUP_RE.test(normaliseWhatsappGroupUrl(v));
}
