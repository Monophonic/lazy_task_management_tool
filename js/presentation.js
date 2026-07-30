import { formatRelative } from "./date-time.js";

export function lerpHex(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map((h) => parseInt(h, 16));
  const b = hexB.match(/\w\w/g).map((h) => parseInt(h, 16));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function colorForRate(pct) {
  const style = getComputedStyle(document.documentElement);
  const red = style.getPropertyValue("--overdue").trim();
  const amber = style.getPropertyValue("--due-soon").trim();
  const green = style.getPropertyValue("--ok").trim();
  if (pct <= 50) return lerpHex(red, amber, pct / 50);
  return lerpHex(amber, green, (pct - 50) / 50);
}

export function buildDonutSvg(onTimeCount, total) {
  const size = 120;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  if (total === 0) {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}" />
    </svg>`;
  }

  const onTimeLen = c * (onTimeCount / total);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--overdue)" stroke-width="${stroke}" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ok)" stroke-width="${stroke}"
      stroke-dasharray="${onTimeLen} ${c}" />
  </svg>`;
}

export function buildHealthRow(label, detailText, pct, color, noData, tag) {
  const row = document.createElement("div");
  row.className = "health-row" + (noData ? " no-data" : "");

  const top = document.createElement("div");
  top.className = "health-row-top";

  const labelWrap = document.createElement("span");
  labelWrap.className = "health-row-label-wrap";

  const labelEl = document.createElement("span");
  labelEl.className = "health-row-label";
  labelEl.textContent = label;
  labelWrap.appendChild(labelEl);

  if (tag) {
    const tagChip = document.createElement("span");
    tagChip.className = "task-tag-chip";
    tagChip.textContent = tag;
    labelWrap.appendChild(tagChip);
  }

  const detailEl = document.createElement("span");
  detailEl.className = "health-row-detail";
  detailEl.textContent = detailText;

  top.appendChild(labelWrap);
  top.appendChild(detailEl);

  const track = document.createElement("div");
  track.className = "health-bar-track";
  const fill = document.createElement("div");
  fill.className = "health-bar-fill";
  fill.style.width = `${pct}%`;
  fill.style.background = color;
  track.appendChild(fill);

  row.appendChild(top);
  row.appendChild(track);
  return row;
}

export function statusLabel(status, due) {
  if (status === "overdue") return `Overdue · was due ${formatRelative(due)}`;
  if (status === "due-soon") return `Due soon · due ${formatRelative(due)}`;
  return `On track · due ${formatRelative(due)}`;
}
