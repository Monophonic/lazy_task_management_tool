import { TIME_OF_DAY_BUCKETS } from "./constants.js";
import { avgDeltaLabel, formatDateTime, toDateInputValue } from "./date-time.js";
import { colorForRate, buildDonutSvg, buildHealthRow } from "./presentation.js";
import { state } from "./state.js";
import { isOneTimeCompleteEvent } from "./storage.js";
import {
  metricsBtn,
  metricsModal,
  metricsCloseBtn,
  overallDonutWrapEl,
  overviewStatsEl,
  taskHealthListEl,
  taskHealthEmptyEl,
  oneTimeHealthEl,
  oneTimeHealthEmptyEl,
  metricsRangeFilterEl,
  metricsCustomRangeEl,
  metricsRangeFromInput,
  metricsRangeToInput,
  metricsRangeApplyBtn,
  metricsRangeNoteEl,
  metricsTabsEl,
  metricsOverviewPanelEl,
  metricsResolvedPanelEl,
  resolvedHealthListEl,
  resolvedHealthEmptyEl,
  resolvedReasonsModal,
  resolvedReasonsTitleEl,
  resolvedReasonsListEl,
  resolvedReasonsCloseBtn,
  metricsTimeOfDayPanelEl,
  timeOfDayTableBodyEl,
  timeOfDayEmptyEl,
  timeOfDayTaskModal,
  timeOfDayTaskTitleEl,
  timeOfDayTaskTableBodyEl,
  timeOfDayTaskEmptyEl,
  timeOfDayTaskCloseBtn,
} from "./dom.js";

function renderOneTimeHealth(total, onTimeCount, deltaSum, hasRange) {
  oneTimeHealthEmptyEl.textContent = hasRange
    ? "No one-time tasks completed in this range."
    : "No one-time tasks completed yet.";
  oneTimeHealthEmptyEl.classList.toggle("hidden", total > 0);
  oneTimeHealthEl.innerHTML = "";
  if (total === 0) return;

  const rate = Math.round((onTimeCount / total) * 100);
  const deltaText = avgDeltaLabel(deltaSum, total);
  oneTimeHealthEl.appendChild(
    buildHealthRow(
      `${total} completed`,
      `${rate}% on time${deltaText ? ` · ${deltaText}` : ""}`,
      rate,
      colorForRate(rate),
      false
    )
  );
}

// Returns {start, end} in ms for the active preset/custom selection, or
// null for "all time" (and for "custom" until both dates are applied).
function getMetricsRangeBounds() {
  if (state.metricsRangeKey === "all") return null;
  if (state.metricsRangeKey === "custom") {
    if (state.metricsCustomFrom === null || state.metricsCustomTo === null) return null;
    return { start: state.metricsCustomFrom, end: state.metricsCustomTo };
  }
  const months = state.metricsRangeKey === "1m" ? 1 : state.metricsRangeKey === "3m" ? 3 : 6;
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  return { start: start.getTime(), end: Date.now() };
}

function updateMetricsRangeButtons() {
  for (const btn of metricsRangeFilterEl.querySelectorAll(".filter-btn")) {
    btn.classList.toggle("active", btn.dataset.range === state.metricsRangeKey);
  }
  metricsCustomRangeEl.classList.toggle("hidden", state.metricsRangeKey !== "custom");
  metricsRangeNoteEl.classList.toggle("hidden", state.metricsRangeKey === "all");
}

function updateMetricsTabButtons() {
  for (const btn of metricsTabsEl.querySelectorAll(".filter-btn")) {
    btn.classList.toggle("active", btn.dataset.tab === state.metricsTab);
  }
  metricsOverviewPanelEl.classList.toggle("hidden", state.metricsTab !== "overview");
  metricsResolvedPanelEl.classList.toggle("hidden", state.metricsTab !== "resolved");
  metricsTimeOfDayPanelEl.classList.toggle("hidden", state.metricsTab !== "timeofday");
}

// Groups "resolved" events by task id, newest-first (completedLog's native
// order), so the first event seen for an id is also its most recent label —
// this keeps the breakdown showing a task's current name even after a
// rename, without a separate lookup pass. Each entry also gets a
// completedCount (how many times *you* completed that same task) so the
// UI can show what share of occurrences were resolved rather than done by
// you, not just a raw count.
function getResolvedBreakdown(range) {
  const byId = new Map();
  for (const e of state.completedLog) {
    if (e.type !== "resolved") continue;
    if (range && (e.at < range.start || e.at > range.end)) continue;
    if (!byId.has(e.id)) byId.set(e.id, { id: e.id, label: e.label, resolvedCount: 0, events: [] });
    const entry = byId.get(e.id);
    entry.resolvedCount += 1;
    entry.events.push(e);
  }

  for (const entry of byId.values()) {
    // Tag lookup only works while the task still exists — a resolved
    // one-time task is deleted (like Complete), so it never has a tag here.
    const liveTask = state.tasks.find((t) => t.id === entry.id);
    entry.tag = liveTask ? liveTask.tag : undefined;

    // All-time, the live task's aggregate counter is the most complete
    // record (some completions may predate the event log). Everywhere
    // else — a date range, or a since-deleted task — fall back to counting
    // "complete" events straight from the log, which is all that's left.
    entry.completedCount = liveTask && !range
      ? liveTask.totalCompletions
      : state.completedLog.filter(
          (e) =>
            e.id === entry.id &&
            (e.type || "complete") === "complete" &&
            (!range || (e.at >= range.start && e.at <= range.end))
        ).length;
    entry.rate = Math.round((entry.resolvedCount / (entry.resolvedCount + entry.completedCount)) * 100);
  }

  return Array.from(byId.values()).sort((a, b) => b.resolvedCount - a.resolvedCount);
}

function renderResolvedBreakdown(range) {
  const breakdown = getResolvedBreakdown(range);

  resolvedHealthEmptyEl.textContent = range
    ? "No tasks resolved without you in this range."
    : "No tasks resolved without you yet.";
  resolvedHealthEmptyEl.classList.toggle("hidden", breakdown.length > 0);

  resolvedHealthListEl.innerHTML = "";
  if (breakdown.length === 0) return;

  for (const entry of breakdown) {
    // Inverted from the on-time-rate coloring: here green means the task
    // is mostly still handled by you, so a high resolved-without-you rate
    // reads as red instead of green.
    const row = buildHealthRow(
      entry.label,
      `${entry.rate}% resolved without you (${entry.resolvedCount}/${entry.resolvedCount + entry.completedCount})`,
      entry.rate,
      colorForRate(100 - entry.rate),
      false,
      entry.tag
    );
    row.classList.add("health-row-clickable");
    row.addEventListener("click", () => openResolvedReasonsModal(entry));
    resolvedHealthListEl.appendChild(row);
  }
}

function openResolvedReasonsModal(entry) {
  resolvedReasonsTitleEl.textContent = `Resolved Without You: ${entry.label}`;

  resolvedReasonsListEl.innerHTML = "";
  const sorted = [...entry.events].sort((a, b) => b.at - a.at);
  for (const e of sorted) {
    const li = document.createElement("li");
    li.className = "history-entry";

    const main = document.createElement("div");
    main.className = "history-entry-main";

    const label = document.createElement("div");
    label.className = "history-entry-label";
    label.textContent = e.reason;

    const meta = document.createElement("div");
    meta.className = "history-entry-meta";
    meta.textContent = `Resolved ${formatDateTime(e.at)}`;

    main.appendChild(label);
    main.appendChild(meta);
    li.appendChild(main);
    resolvedReasonsListEl.appendChild(li);
  }

  resolvedReasonsModal.classList.remove("hidden");
}

export function closeResolvedReasonsModal() {
  resolvedReasonsModal.classList.add("hidden");
}

// Counts real completions (recurring + one-time, never resolves/reschedules)
// by which 4-hour bucket of the day they landed in, optionally narrowed to
// one task's own completions and/or the active metrics date range.
function getTimeOfDayBreakdown(range, taskId) {
  const counts = TIME_OF_DAY_BUCKETS.map(() => 0);
  let total = 0;

  for (const e of state.completedLog) {
    if ((e.type || "complete") !== "complete") continue;
    if (taskId && e.id !== taskId) continue;

    const at = e.at ?? e.completedAt;
    if (at === undefined) continue;
    if (range && (at < range.start || at > range.end)) continue;

    const completedAt = e.completedAt ?? e.at;
    const hour = new Date(completedAt).getHours();
    const bucketIndex = Math.floor(hour / 4);
    counts[bucketIndex] += 1;
    total += 1;
  }

  return { counts, total };
}

function buildTimeOfDayRows(tbodyEl, counts, total) {
  tbodyEl.innerHTML = "";
  const maxCount = Math.max(...counts, 1);

  TIME_OF_DAY_BUCKETS.forEach((bucket, i) => {
    const count = counts[i];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const barPct = Math.round((count / maxCount) * 100);

    const tr = document.createElement("tr");

    const labelTd = document.createElement("td");
    labelTd.textContent = bucket.label;

    const countTd = document.createElement("td");
    countTd.textContent = total > 0 ? `${count} (${pct}%)` : String(count);

    const barTd = document.createElement("td");
    const track = document.createElement("div");
    track.className = "time-bar-track";
    const fill = document.createElement("div");
    fill.className = "time-bar-fill";
    fill.style.width = `${barPct}%`;
    track.appendChild(fill);
    barTd.appendChild(track);

    tr.appendChild(labelTd);
    tr.appendChild(countTd);
    tr.appendChild(barTd);
    tbodyEl.appendChild(tr);
  });
}

function renderTimeOfDayBreakdown(range) {
  const { counts, total } = getTimeOfDayBreakdown(range, null);
  timeOfDayEmptyEl.textContent = range ? "No completions in this range." : "No completions yet.";
  timeOfDayEmptyEl.classList.toggle("hidden", total > 0);
  metricsTimeOfDayPanelEl.querySelector(".time-of-day-table").classList.toggle("hidden", total === 0);
  buildTimeOfDayRows(timeOfDayTableBodyEl, counts, total);
}

function openTimeOfDayTaskModal(task) {
  const range = getMetricsRangeBounds();
  const { counts, total } = getTimeOfDayBreakdown(range, task.id);

  timeOfDayTaskTitleEl.textContent = `Completion Times: ${task.label}`;
  timeOfDayTaskEmptyEl.textContent = range
    ? "No completions for this task in this range."
    : "No completions for this task yet.";
  timeOfDayTaskEmptyEl.classList.toggle("hidden", total > 0);
  timeOfDayTaskModal.querySelector(".time-of-day-table").classList.toggle("hidden", total === 0);
  buildTimeOfDayRows(timeOfDayTaskTableBodyEl, counts, total);

  timeOfDayTaskModal.classList.remove("hidden");
}

export function closeTimeOfDayTaskModal() {
  timeOfDayTaskModal.classList.add("hidden");
}

function renderMetrics() {
  updateMetricsRangeButtons();
  updateMetricsTabButtons();
  const range = getMetricsRangeBounds();
  const recurringTasks = state.tasks.filter((t) => !t.isOneTime);

  let sumCompletions, sumOnTime, sumDelta, perTaskStats;

  if (!range) {
    // All time: the fast aggregate counters, exactly as before date
    // filtering existed.
    sumCompletions = recurringTasks.reduce((s, t) => s + t.totalCompletions, 0);
    sumOnTime = recurringTasks.reduce((s, t) => s + t.onTimeCompletions, 0);
    sumDelta = recurringTasks.reduce((s, t) => s + (t.totalDeltaMs || 0), 0);
    perTaskStats = recurringTasks.map((t) => ({
      task: t,
      total: t.totalCompletions,
      onTime: t.onTimeCompletions,
      delta: t.totalDeltaMs || 0,
    }));
  } else {
    // Date-filtered: only the event log carries timestamps, so this can
    // only reflect completions logged since that feature shipped.
    const recurringEvents = state.completedLog.filter(
      (e) => (e.type || "complete") === "complete" && e.isOneTime === false && e.at >= range.start && e.at <= range.end
    );
    const byTaskId = new Map(recurringTasks.map((t) => [t.id, { task: t, total: 0, onTime: 0, delta: 0 }]));
    for (const e of recurringEvents) {
      const entry = byTaskId.get(e.id);
      if (!entry) continue; // event belongs to a task that's since been deleted
      entry.total += 1;
      if (e.onTime) entry.onTime += 1;
      entry.delta += e.deltaMs;
    }
    perTaskStats = Array.from(byTaskId.values());
    sumCompletions = recurringEvents.length;
    sumOnTime = recurringEvents.filter((e) => e.onTime).length;
    sumDelta = recurringEvents.reduce((s, e) => s + e.deltaMs, 0);
  }

  // Must filter to one-time completions here: completedLog now also holds
  // recurring completions (already counted above) and reschedule events
  // (no onTime/dueAt/completedAt) — without this filter, recurring
  // completions would be double-counted and reschedules would corrupt the
  // math with NaN.
  const oneTimeEvents = state.completedLog.filter(
    (e) => isOneTimeCompleteEvent(e) && (!range || (e.at >= range.start && e.at <= range.end))
  );
  const oneTimeTotal = oneTimeEvents.length;
  const oneTimeOnTime = oneTimeEvents.filter((e) => e.onTime).length;
  const oneTimeDelta = oneTimeEvents.reduce((s, e) => s + (e.completedAt - e.dueAt), 0);

  const totalAll = sumCompletions + oneTimeTotal;
  const onTimeAll = sumOnTime + oneTimeOnTime;
  const deltaAll = sumDelta + oneTimeDelta;
  const overallRate = totalAll > 0 ? Math.round((onTimeAll / totalAll) * 100) : null;

  overallDonutWrapEl.innerHTML = buildDonutSvg(onTimeAll, totalAll);
  const center = document.createElement("div");
  center.className = "donut-center";
  const rateEl = document.createElement("strong");
  rateEl.textContent = overallRate !== null ? `${overallRate}%` : "—";
  const rateLabelEl = document.createElement("span");
  rateLabelEl.textContent = "on time";
  center.appendChild(rateEl);
  center.appendChild(rateLabelEl);
  overallDonutWrapEl.appendChild(center);

  const overallDeltaText = avgDeltaLabel(deltaAll, totalAll);
  const overviewRows = [
    ["Total completions", String(totalAll)],
    ["Recurring / one-time", `${sumCompletions} / ${oneTimeTotal}`],
  ];
  if (overallDeltaText) overviewRows.push(["Average timing", overallDeltaText]);

  overviewStatsEl.innerHTML = "";
  for (const [labelText, valueText] of overviewRows) {
    const span = document.createElement("span");
    span.textContent = `${labelText}: `;
    const strong = document.createElement("strong");
    strong.textContent = valueText;
    span.appendChild(strong);
    overviewStatsEl.appendChild(span);
  }

  taskHealthListEl.innerHTML = "";
  taskHealthEmptyEl.classList.toggle("hidden", perTaskStats.length > 0);

  const withData = perTaskStats
    .filter((s) => s.total > 0)
    .map((s) => ({ task: s.task, rate: Math.round((s.onTime / s.total) * 100), total: s.total, delta: s.delta }))
    .sort((a, b) => b.rate - a.rate);
  const noData = perTaskStats.filter((s) => s.total === 0);

  for (const { task, rate, total, delta } of withData) {
    const deltaText = avgDeltaLabel(delta, total);
    const row = buildHealthRow(
      task.label,
      `${rate}% on time${deltaText ? ` · ${deltaText}` : ""}`,
      rate,
      colorForRate(rate),
      false
    );
    row.classList.add("health-row-clickable");
    row.addEventListener("click", () => openTimeOfDayTaskModal(task));
    taskHealthListEl.appendChild(row);
  }
  for (const { task } of noData) {
    const row = buildHealthRow(task.label, range ? "No completions in this range" : "No completions yet", 0, "var(--border)", true);
    row.classList.add("health-row-clickable");
    row.addEventListener("click", () => openTimeOfDayTaskModal(task));
    taskHealthListEl.appendChild(row);
  }

  renderOneTimeHealth(oneTimeTotal, oneTimeOnTime, oneTimeDelta, Boolean(range));
  renderResolvedBreakdown(range);
  renderTimeOfDayBreakdown(range);
}

function openMetricsModal() {
  renderMetrics();
  metricsModal.classList.remove("hidden");
}

export function closeMetricsModal() {
  metricsModal.classList.add("hidden");
}

export function initMetrics() {
  metricsBtn.addEventListener("click", openMetricsModal);
  metricsCloseBtn.addEventListener("click", closeMetricsModal);
  metricsModal.addEventListener("click", (e) => {
    if (e.target === metricsModal) closeMetricsModal();
  });

  metricsRangeFilterEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    state.metricsRangeKey = btn.dataset.range;
    if (state.metricsRangeKey === "custom") {
      if (state.metricsCustomFrom !== null) metricsRangeFromInput.value = toDateInputValue(state.metricsCustomFrom);
      if (state.metricsCustomTo !== null) metricsRangeToInput.value = toDateInputValue(state.metricsCustomTo);
    }
    renderMetrics();
  });
  metricsRangeApplyBtn.addEventListener("click", () => {
    const fromVal = metricsRangeFromInput.value;
    const toVal = metricsRangeToInput.value;
    if (!fromVal || !toVal) return;
    const start = new Date(`${fromVal}T00:00:00`).getTime();
    const end = new Date(`${toVal}T23:59:59.999`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) return;
    state.metricsCustomFrom = start;
    state.metricsCustomTo = end;
    state.metricsRangeKey = "custom";
    renderMetrics();
  });

  metricsTabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn[data-tab]");
    if (!btn) return;
    state.metricsTab = btn.dataset.tab;
    updateMetricsTabButtons();
  });

  resolvedReasonsCloseBtn.addEventListener("click", closeResolvedReasonsModal);
  resolvedReasonsModal.addEventListener("click", (e) => {
    if (e.target === resolvedReasonsModal) closeResolvedReasonsModal();
  });

  timeOfDayTaskCloseBtn.addEventListener("click", closeTimeOfDayTaskModal);
  timeOfDayTaskModal.addEventListener("click", (e) => {
    if (e.target === timeOfDayTaskModal) closeTimeOfDayTaskModal();
  });
}
