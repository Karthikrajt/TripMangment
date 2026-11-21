export const TIMEZONE = 'Asia/Kolkata';
export const LOCALE = 'en-IN';

/** Free-tier reference limits used for the quota panel. Verify current values before relying on them. */
export const FREE_TIER = {
  firestoreReadsPerDay: 50_000,
  firestoreWritesPerDay: 20_000,
  firestoreStorageBytes: 1024 * 1024 * 1024,
  supabaseStorageBytes: 1024 * 1024 * 1024,
  hostingTransferBytesPerMonth: 10 * 1024 * 1024 * 1024,
};

export const CHAT_PAGE_SIZE = 50;
export const NOTIFICATION_PAGE_SIZE = 50;
