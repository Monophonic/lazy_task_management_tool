export const STORAGE_KEY = "task-manager:tasks";
export const HISTORY_STORAGE_KEY = "task-manager:completedLog";
export const TAGS_STORAGE_KEY = "task-manager:tags";
export const SYNCED_UID_KEY = "task-manager:syncedUid";
export const LAST_LOCAL_CHANGE_KEY = "task-manager:lastLocalChangeAt";
export const MAX_HISTORY_DISPLAY_ENTRIES = 100; // display-only cap for the History modal; storage itself is unlimited
export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS; // approximate — a fixed 30-day month, not calendar-exact
export const LENIENCY_MS = 6 * 60 * 60 * 1000; // +/- 6 hours
export const DUE_SOON_WINDOW_MS = DAY_MS; // flagged "due soon" within 24h of the deadline
export const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576; // Firestore's real per-document size limit
export const LOCAL_STORAGE_WARN_BYTES = 5_000_000; // conservative, clearly-labeled-as-an-estimate threshold

// Fixed 4-hour buckets spanning the day, used by the "By Time of Day" metrics view.
export const TIME_OF_DAY_BUCKETS = [
  { startHour: 0, label: "12am – 4am" },
  { startHour: 4, label: "4am – 8am" },
  { startHour: 8, label: "8am – 12pm" },
  { startHour: 12, label: "12pm – 4pm" },
  { startHour: 16, label: "4pm – 8pm" },
  { startHour: 20, label: "8pm – 12am" },
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MAX_OCCURRENCES_PER_TASK = 200; // safety cap against pathological cadences
