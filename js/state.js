import { STORAGE_KEY, HISTORY_STORAGE_KEY, TAGS_STORAGE_KEY, LAST_LOCAL_CHANGE_KEY } from "./constants.js";
import { loadTasks, loadCompletedLog, loadTags } from "./storage.js";

// A single mutable holder object, not separate `export let` bindings: several
// call sites do `tasks = tasks.filter(...)` / `tags = ...` from what are now
// importing modules, and an imported `let` binding is read-only to importers.
// Reassigning a property on this object (`state.tasks = ...`) is always valid;
// only rebinding `state` itself would be disallowed, and nothing does that.
//
// Never alias `const tasks = state.tasks` inside a function — always
// reference `state.tasks` inline. handleAuthChange and the sync-conflict
// handlers are async and mutate `state.*` across `await` boundaries; a
// captured local alias would silently go stale.
export const state = {
  tasks: loadTasks(),
  completedLog: loadCompletedLog(),
  tags: loadTags(),
  pendingDeleteId: null,
  pendingResolveId: null,
  // { type: "status", value: "all"|"overdue"|"due-soon"|"ok" } or { type: "tag", value: "<tagName>" } —
  // status and tag filters share one active selection, exactly like the status filters alone used to.
  activeFilter: { type: "status", value: "all" },
  pendingImportData: null,
  pendingCalendarTask: null,
  syncConfigured: false,
  cloudUser: null,
  pendingRemoteConflict: null,
  // "all" | "1m" | "3m" | "6m" | "custom" — persists across modal open/close
  // within a session, resetting only on page load.
  metricsRangeKey: "all",
  metricsCustomFrom: null, // ms, start of the "from" day, when metricsRangeKey === "custom"
  metricsCustomTo: null, // ms, end of the "to" day, when metricsRangeKey === "custom"
  // "overview" | "resolved" | "timeofday" — persists across modal open/close, like metricsRangeKey.
  metricsTab: "overview",
};

export function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  schedulePush();
}

export function saveCompletedLog() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.completedLog));
  schedulePush();
}

export function saveTags() {
  localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(state.tags));
  schedulePush();
}

export function schedulePush() {
  // Stamped unconditionally (not just while signed in) so it's already
  // there the moment a device does sign in, and survives a reload even if
  // the debounced Firestore push below never got the chance to fire —
  // see the freshness check in startRemoteListener().
  localStorage.setItem(LAST_LOCAL_CHANGE_KEY, String(Date.now()));
  if (state.cloudUser && window.TaskSync) {
    window.TaskSync.push({ tasks: state.tasks, completedLog: state.completedLog, tags: state.tags });
  }
}
