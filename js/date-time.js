import { DAY_MS, WEEK_MS, MONTH_MS, DUE_SOON_WINDOW_MS, MAX_OCCURRENCES_PER_TASK } from "./constants.js";

export function makeId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function unitMs(cadenceUnit) {
  if (cadenceUnit === "month") return MONTH_MS;
  if (cadenceUnit === "week") return WEEK_MS;
  return DAY_MS;
}

export function intervalMs(cadenceCount, cadenceEvery, cadenceUnit) {
  return (unitMs(cadenceUnit) * cadenceEvery) / cadenceCount;
}

export function nextDueAt(task) {
  if (task.isOneTime) return task.dueAt;
  return task.lastCompletedAt + intervalMs(task.cadenceCount, task.cadenceEvery || 1, task.cadenceUnit);
}

export function toDatetimeLocalValue(ms) {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value) {
  return new Date(value).getTime();
}

export function cadenceLabel(task) {
  const unit = task.cadenceUnit;
  const n = task.cadenceCount;
  const every = task.cadenceEvery || 1;

  if (every === 1) {
    return n === 1 ? `1 / ${unit}` : `${n} / ${unit}`;
  }
  const unitPlural = `${unit}s`;
  return n === 1 ? `every ${every} ${unitPlural}` : `${n} every ${every} ${unitPlural}`;
}

export function formatDateTime(ms) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(ms) {
  const now = Date.now();
  const diff = ms - now;
  const abs = Math.abs(diff);
  const future = diff >= 0;

  let value, unit;
  if (abs < 60 * 60 * 1000) {
    value = Math.round(abs / (60 * 1000));
    unit = "min";
  } else if (abs < DAY_MS) {
    value = Math.round(abs / (60 * 60 * 1000));
    unit = "hr";
  } else {
    value = Math.round(abs / DAY_MS);
    unit = "day";
  }
  const plural = value === 1 ? "" : "s";
  if (abs < 60 * 1000) return future ? "due now" : "just now";
  return future ? `in ${value} ${unit}${plural}` : `${value} ${unit}${plural} ago`;
}

export function getStatus(task) {
  const due = nextDueAt(task);
  const now = Date.now();
  if (now > due) return "overdue";
  if (due - now <= DUE_SOON_WINDOW_MS) return "due-soon";
  return "ok";
}

export function formatDurationMagnitude(ms) {
  const abs = Math.abs(ms);
  if (abs < 60 * 60 * 1000) return `${Math.round(abs / (60 * 1000))} min`;
  if (abs < DAY_MS) return `${(abs / (60 * 60 * 1000)).toFixed(1)} hrs`;
  return `${(abs / DAY_MS).toFixed(1)} days`;
}

export function avgDeltaLabel(totalDeltaMs, count) {
  if (!count) return null;
  const avg = totalDeltaMs / count;
  if (Math.abs(avg) < 60 * 1000) return "right on time, on average";
  return avg > 0
    ? `avg ${formatDurationMagnitude(avg)} late`
    : `avg ${formatDurationMagnitude(avg)} early`;
}

export function startOfWeek(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function occurrencesInRange(task, rangeStart, rangeEnd) {
  if (task.isOneTime) {
    return task.dueAt >= rangeStart && task.dueAt < rangeEnd ? [task.dueAt] : [];
  }

  const interval = intervalMs(task.cadenceCount, task.cadenceEvery || 1, task.cadenceUnit);
  const anchor = task.lastCompletedAt;
  let n = Math.max(1, Math.ceil((rangeStart - anchor) / interval));
  const due = [];
  for (let i = 0; i < MAX_OCCURRENCES_PER_TASK; i++, n++) {
    const dueAt = anchor + n * interval;
    if (dueAt >= rangeEnd) break;
    if (dueAt >= rangeStart) due.push(dueAt);
  }
  return due;
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateInputValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
