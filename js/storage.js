import { STORAGE_KEY, HISTORY_STORAGE_KEY, TAGS_STORAGE_KEY } from "./constants.js";

export function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load tasks from localStorage", err);
    return [];
  }
}

export function loadCompletedLog() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load completed log from localStorage", err);
    return [];
  }
}

export function loadTags() {
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load tags from localStorage", err);
    return [];
  }
}

// A completedLog entry is either a completion ("complete") or a manual
// reschedule ("reschedule"). Legacy entries (saved before this distinction
// existed) predate both fields and were always one-time-task completions —
// so treating a missing `type`/`isOneTime` as "complete"/true is not a guess,
// it's the only value that was ever possible for those entries.
export function isOneTimeCompleteEvent(e) {
  const type = e.type || "complete";
  const isOneTime = e.isOneTime === undefined ? true : e.isOneTime;
  return type === "complete" && isOneTime;
}

// Unique key for de-duplicating completedLog entries across devices during
// sync merges. New entries carry `eventId`; legacy entries don't, so fall
// back to a composite key built from fields that were always present.
export function completedLogEntryKey(e) {
  return e.eventId || `${e.id}|${e.completedAt ?? e.at}|${e.type || "complete"}`;
}

// Union-merges two completedLog arrays by entry key, keeping every event
// from both sides (never silently dropping one device's history), sorted
// newest-first. Used instead of a wholesale array replace anywhere sync
// applies remote completedLog data, since every completion now writes here
// (not just rare one-time-task completions) — a wholesale replace would
// risk losing one device's events on a close-together multi-device write.
export function mergeCompletedLogs(local, remote) {
  const byKey = new Map();
  for (const e of remote) byKey.set(completedLogEntryKey(e), e);
  for (const e of local) byKey.set(completedLogEntryKey(e), e);
  return Array.from(byKey.values()).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

// Mirrors exactly what gets pushed to Firestore ({tasks, completedLog, tags}),
// so this is a good proxy for both the local-storage footprint and the
// cloud sync document size.
export function estimateDataSizeBytes(tasks, completedLog, tags) {
  return new Blob([JSON.stringify({ tasks, completedLog, tags })]).size;
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function parseImportData(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That file isn't valid JSON." };
  }

  if (Array.isArray(parsed)) {
    return { tasks: parsed, completedLog: [], tags: [] };
  }
  if (parsed && Array.isArray(parsed.tasks)) {
    return {
      tasks: parsed.tasks,
      completedLog: Array.isArray(parsed.completedLog) ? parsed.completedLog : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  }
  return { error: "This file doesn't look like a task export." };
}
