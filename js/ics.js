import { nextDueAt, intervalMs, pad2 } from "./date-time.js";

export function toIcsUtc(ms) {
  const d = new Date(ms);
  return (
    d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

export function icsEscape(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function foldIcsLine(line) {
  const CHUNK = 74; // RFC 5545: content lines should not exceed 75 octets
  if (line.length <= 75) return line;
  let result = line.slice(0, CHUNK);
  let rest = line.slice(CHUNK);
  while (rest.length > 0) {
    result += "\r\n " + rest.slice(0, CHUNK - 1);
    rest = rest.slice(CHUNK - 1);
  }
  return result;
}

export function buildIcsForTask(task) {
  const now = Date.now();
  const dueAt = nextDueAt(task);
  const eventDurationMs = 30 * 60 * 1000;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lazy Task Management Tool//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${task.id}@lazy-task-management-tool`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(dueAt)}`,
    `DTEND:${toIcsUtc(dueAt + eventDurationMs)}`,
    `SUMMARY:${icsEscape(task.label)}`,
  ];

  if (task.description) {
    lines.push(`DESCRIPTION:${icsEscape(task.description)}`);
  }

  if (!task.isOneTime) {
    // Mirrors the app's own fixed-interval cadence math rather than a
    // calendar-natural pattern (e.g. "3x/week" isn't Mon/Wed/Fri).
    const hours = Math.max(
      1,
      Math.round(intervalMs(task.cadenceCount, task.cadenceEvery || 1, task.cadenceUnit) / (60 * 60 * 1000))
    );
    lines.push(`RRULE:FREQ=HOURLY;INTERVAL=${hours}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function downloadIcsForTask(task) {
  const ics = buildIcsForTask(task);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const safeName = task.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "").slice(0, 40) || "task";

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Google's documented "quick add" URL scheme — no OAuth or API key needed,
// it just opens Google Calendar's own event-creation page pre-filled; the
// user still has to click Save there themselves.
export function buildGoogleCalendarUrl(task) {
  const dueAt = nextDueAt(task);
  const eventDurationMs = 30 * 60 * 1000;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.label,
    dates: `${toIcsUtc(dueAt)}/${toIcsUtc(dueAt + eventDurationMs)}`,
  });
  if (task.description) params.set("details", task.description);

  if (!task.isOneTime) {
    // Same fixed-interval approximation buildIcsForTask uses, but Google's
    // own recurrence picker only recognizes whole-day/whole-week
    // intervals as a normal rule — anything else it still saves, just
    // labeled "Unsupported recurrence". Days/weeks are fixed-length units
    // (unlike months), so collapsing an even multiple of them into
    // FREQ=DAILY/WEEKLY changes nothing about which instants recur.
    const hours = Math.max(
      1,
      Math.round(intervalMs(task.cadenceCount, task.cadenceEvery || 1, task.cadenceUnit) / (60 * 60 * 1000))
    );
    let recur;
    if (hours % 168 === 0) {
      recur = `RRULE:FREQ=WEEKLY;INTERVAL=${hours / 168}`;
    } else if (hours % 24 === 0) {
      recur = `RRULE:FREQ=DAILY;INTERVAL=${hours / 24}`;
    } else {
      recur = `RRULE:FREQ=HOURLY;INTERVAL=${hours}`;
    }
    params.set("recur", recur);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
