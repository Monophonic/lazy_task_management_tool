(function () {
  "use strict";

  const STORAGE_KEY = "task-manager:tasks";
  const HISTORY_STORAGE_KEY = "task-manager:completedLog";
  const SYNCED_UID_KEY = "task-manager:syncedUid";
  const MAX_HISTORY_DISPLAY_ENTRIES = 100; // display-only cap for the History modal; storage itself is unlimited
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;
  const MONTH_MS = 30 * DAY_MS; // approximate — a fixed 30-day month, not calendar-exact
  const LENIENCY_MS = 6 * 60 * 60 * 1000; // +/- 6 hours
  const DUE_SOON_WINDOW_MS = DAY_MS; // flagged "due soon" within 24h of the deadline
  const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576; // Firestore's real per-document size limit
  const LOCAL_STORAGE_WARN_BYTES = 5_000_000; // conservative, clearly-labeled-as-an-estimate threshold

  const taskListEl = document.getElementById("taskList");
  const emptyStateEl = document.getElementById("emptyState");
  const weekCalendarEl = document.getElementById("weekCalendar");
  const statusFiltersEl = document.getElementById("statusFilters");
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MAX_OCCURRENCES_PER_TASK = 200; // safety cap against pathological cadences

  const addTaskBtn = document.getElementById("addTaskBtn");
  const taskModal = document.getElementById("taskModal");
  const modalTitle = document.getElementById("modalTitle");
  const taskForm = document.getElementById("taskForm");
  const taskIdInput = document.getElementById("taskId");
  const labelInput = document.getElementById("label");
  const descriptionInput = document.getElementById("description");
  const cadenceCountInput = document.getElementById("cadenceCount");
  const cadenceEveryInput = document.getElementById("cadenceEvery");
  const cadenceUnitInput = document.getElementById("cadenceUnit");
  const isOneTimeInput = document.getElementById("isOneTime");
  const cadenceGroupEl = document.getElementById("cadenceGroup");
  const dueDateGroupEl = document.getElementById("dueDateGroup");
  const dueDateInput = document.getElementById("dueDate");
  const rescheduleGroupEl = document.getElementById("rescheduleGroup");
  const rescheduleToggleInput = document.getElementById("rescheduleToggle");
  const rescheduleDateGroupEl = document.getElementById("rescheduleDateGroup");
  const rescheduleDateInput = document.getElementById("rescheduleDate");
  const cancelBtn = document.getElementById("cancelBtn");

  const confirmModal = document.getElementById("confirmModal");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");

  const historyBtn = document.getElementById("historyBtn");
  const historyModal = document.getElementById("historyModal");
  const historyCloseBtn = document.getElementById("historyCloseBtn");
  const historyStatsEl = document.getElementById("historyStats");
  const historyLogEl = document.getElementById("historyLog");
  const historyEmptyEl = document.getElementById("historyEmpty");

  const metricsBtn = document.getElementById("metricsBtn");
  const metricsModal = document.getElementById("metricsModal");
  const metricsCloseBtn = document.getElementById("metricsCloseBtn");
  const overallDonutWrapEl = document.getElementById("overallDonutWrap");
  const overviewStatsEl = document.getElementById("overviewStats");
  const taskHealthListEl = document.getElementById("taskHealthList");
  const taskHealthEmptyEl = document.getElementById("taskHealthEmpty");
  const oneTimeHealthEl = document.getElementById("oneTimeHealth");
  const oneTimeHealthEmptyEl = document.getElementById("oneTimeHealthEmpty");
  const metricsRangeFilterEl = document.getElementById("metricsRangeFilter");
  const metricsCustomRangeEl = document.getElementById("metricsCustomRange");
  const metricsRangeFromInput = document.getElementById("metricsRangeFrom");
  const metricsRangeToInput = document.getElementById("metricsRangeTo");
  const metricsRangeApplyBtn = document.getElementById("metricsRangeApplyBtn");
  const metricsRangeNoteEl = document.getElementById("metricsRangeNote");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");
  const localUsageRowEl = document.getElementById("localUsageRow");
  const cloudUsageRowEl = document.getElementById("cloudUsageRow");
  const usageWarningEl = document.getElementById("usageWarning");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");
  const importErrorEl = document.getElementById("importError");
  const importConfirmEl = document.getElementById("importConfirm");
  const importConfirmTextEl = document.getElementById("importConfirmText");
  const importCancelBtn = document.getElementById("importCancelBtn");
  const importConfirmBtn = document.getElementById("importConfirmBtn");

  const syncUnconfiguredEl = document.getElementById("syncUnconfigured");
  const syncSignedOutEl = document.getElementById("syncSignedOut");
  const syncSignedInEl = document.getElementById("syncSignedIn");
  const syncAccountEmailEl = document.getElementById("syncAccountEmail");
  const syncStatusEl = document.getElementById("syncStatus");
  const syncSignInErrorEl = document.getElementById("syncSignInError");
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  const syncConflictModal = document.getElementById("syncConflictModal");
  const syncConflictTextEl = document.getElementById("syncConflictText");
  const syncConflictCancelBtn = document.getElementById("syncConflictCancelBtn");
  const syncUseLocalBtn = document.getElementById("syncUseLocalBtn");
  const syncUseCloudBtn = document.getElementById("syncUseCloudBtn");

  const calendarPromptModal = document.getElementById("calendarPromptModal");
  const calendarPromptTextEl = document.getElementById("calendarPromptText");
  const calendarPromptSkipBtn = document.getElementById("calendarPromptSkipBtn");
  const calendarPromptDownloadBtn = document.getElementById("calendarPromptDownloadBtn");

  let tasks = loadTasks();
  let completedLog = loadCompletedLog();
  let pendingDeleteId = null;
  let statusFilter = "all";
  let pendingImportData = null;
  let pendingCalendarTask = null;

  let syncConfigured = false;
  let cloudUser = null;
  let pendingRemoteConflict = null;

  // "all" | "1m" | "3m" | "6m" | "custom" — persists across modal open/close
  // within a session, resetting only on page load.
  let metricsRangeKey = "all";
  let metricsCustomFrom = null; // ms, start of the "from" day, when metricsRangeKey === "custom"
  let metricsCustomTo = null; // ms, end of the "to" day, when metricsRangeKey === "custom"

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Failed to load tasks from localStorage", err);
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    schedulePush();
  }

  function loadCompletedLog() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Failed to load completed log from localStorage", err);
      return [];
    }
  }

  function saveCompletedLog() {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(completedLog));
    schedulePush();
  }

  function schedulePush() {
    if (cloudUser && window.TaskSync) {
      window.TaskSync.push({ tasks, completedLog });
    }
  }

  // A completedLog entry is either a completion ("complete") or a manual
  // reschedule ("reschedule"). Legacy entries (saved before this distinction
  // existed) predate both fields and were always one-time-task completions —
  // so treating a missing `type`/`isOneTime` as "complete"/true is not a guess,
  // it's the only value that was ever possible for those entries.
  function isOneTimeCompleteEvent(e) {
    const type = e.type || "complete";
    const isOneTime = e.isOneTime === undefined ? true : e.isOneTime;
    return type === "complete" && isOneTime;
  }

  // Unique key for de-duplicating completedLog entries across devices during
  // sync merges. New entries carry `eventId`; legacy entries don't, so fall
  // back to a composite key built from fields that were always present.
  function completedLogEntryKey(e) {
    return e.eventId || `${e.id}|${e.completedAt ?? e.at}|${e.type || "complete"}`;
  }

  // Union-merges two completedLog arrays by entry key, keeping every event
  // from both sides (never silently dropping one device's history), sorted
  // newest-first. Used instead of a wholesale array replace anywhere sync
  // applies remote completedLog data, since every completion now writes here
  // (not just rare one-time-task completions) — a wholesale replace would
  // risk losing one device's events on a close-together multi-device write.
  function mergeCompletedLogs(local, remote) {
    const byKey = new Map();
    for (const e of remote) byKey.set(completedLogEntryKey(e), e);
    for (const e of local) byKey.set(completedLogEntryKey(e), e);
    return Array.from(byKey.values()).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }

  // Mirrors exactly what gets pushed to Firestore ({tasks, completedLog}), so
  // this is a good proxy for both the local-storage footprint and the cloud
  // sync document size.
  function estimateDataSizeBytes() {
    return new Blob([JSON.stringify({ tasks, completedLog })]).size;
  }

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function unitMs(cadenceUnit) {
    if (cadenceUnit === "month") return MONTH_MS;
    if (cadenceUnit === "week") return WEEK_MS;
    return DAY_MS;
  }

  function intervalMs(cadenceCount, cadenceEvery, cadenceUnit) {
    return (unitMs(cadenceUnit) * cadenceEvery) / cadenceCount;
  }

  function nextDueAt(task) {
    if (task.isOneTime) return task.dueAt;
    return task.lastCompletedAt + intervalMs(task.cadenceCount, task.cadenceEvery || 1, task.cadenceUnit);
  }

  function toDatetimeLocalValue(ms) {
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function fromDatetimeLocalValue(value) {
    return new Date(value).getTime();
  }

  function cadenceLabel(task) {
    const unit = task.cadenceUnit;
    const n = task.cadenceCount;
    const every = task.cadenceEvery || 1;

    if (every === 1) {
      return n === 1 ? `1 / ${unit}` : `${n} / ${unit}`;
    }
    const unitPlural = `${unit}s`;
    return n === 1 ? `every ${every} ${unitPlural}` : `${n} every ${every} ${unitPlural}`;
  }

  function formatDateTime(ms) {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatRelative(ms) {
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

  function getStatus(task) {
    const due = nextDueAt(task);
    const now = Date.now();
    if (now > due) return "overdue";
    if (due - now <= DUE_SOON_WINDOW_MS) return "due-soon";
    return "ok";
  }

  function formatDurationMagnitude(ms) {
    const abs = Math.abs(ms);
    if (abs < 60 * 60 * 1000) return `${Math.round(abs / (60 * 1000))} min`;
    if (abs < DAY_MS) return `${(abs / (60 * 60 * 1000)).toFixed(1)} hrs`;
    return `${(abs / DAY_MS).toFixed(1)} days`;
  }

  function avgDeltaLabel(totalDeltaMs, count) {
    if (!count) return null;
    const avg = totalDeltaMs / count;
    if (Math.abs(avg) < 60 * 1000) return "right on time, on average";
    return avg > 0
      ? `avg ${formatDurationMagnitude(avg)} late`
      : `avg ${formatDurationMagnitude(avg)} early`;
  }

  function lerpHex(hexA, hexB, t) {
    const a = hexA.match(/\w\w/g).map((h) => parseInt(h, 16));
    const b = hexB.match(/\w\w/g).map((h) => parseInt(h, 16));
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function colorForRate(pct) {
    const style = getComputedStyle(document.documentElement);
    const red = style.getPropertyValue("--overdue").trim();
    const amber = style.getPropertyValue("--due-soon").trim();
    const green = style.getPropertyValue("--ok").trim();
    if (pct <= 50) return lerpHex(red, amber, pct / 50);
    return lerpHex(amber, green, (pct - 50) / 50);
  }

  function buildDonutSvg(onTimeCount, total) {
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

  function buildHealthRow(label, detailText, pct, color, noData) {
    const row = document.createElement("div");
    row.className = "health-row" + (noData ? " no-data" : "");

    const top = document.createElement("div");
    top.className = "health-row-top";

    const labelEl = document.createElement("span");
    labelEl.className = "health-row-label";
    labelEl.textContent = label;

    const detailEl = document.createElement("span");
    detailEl.className = "health-row-detail";
    detailEl.textContent = detailText;

    top.appendChild(labelEl);
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

  function statusLabel(status, due) {
    if (status === "overdue") return `Overdue · was due ${formatRelative(due)}`;
    if (status === "due-soon") return `Due soon · due ${formatRelative(due)}`;
    return `On track · due ${formatRelative(due)}`;
  }

  function updateStatusFilters(entries) {
    const counts = { all: entries.length, overdue: 0, "due-soon": 0, ok: 0 };
    for (const { status } of entries) counts[status] += 1;

    for (const btn of statusFiltersEl.querySelectorAll(".filter-btn")) {
      const filter = btn.dataset.filter;
      btn.classList.toggle("active", filter === statusFilter);
      btn.querySelector(".filter-count").textContent = `(${counts[filter]})`;
    }
  }

  function render() {
    const entries = tasks
      .map((task) => ({ task, due: nextDueAt(task), status: getStatus(task) }))
      .sort((a, b) => a.due - b.due);

    updateStatusFilters(entries);

    const visible = statusFilter === "all" ? entries : entries.filter((e) => e.status === statusFilter);

    taskListEl.innerHTML = "";
    emptyStateEl.classList.toggle("hidden", visible.length > 0);
    emptyStateEl.querySelector("p").textContent = tasks.length === 0
      ? "No tasks yet. Add your first recurring task to get started."
      : "No tasks match this filter.";

    for (const { task, due, status } of visible) {
      const li = document.createElement("li");
      li.className = "task-card";
      li.dataset.id = task.id;

      const main = document.createElement("div");
      main.className = "task-main";

      const topRow = document.createElement("div");
      topRow.className = "task-top-row";

      const labelEl = document.createElement("p");
      labelEl.className = "task-label";
      labelEl.textContent = task.label;

      const badge = document.createElement("span");
      badge.className = `badge ${status}`;
      badge.innerHTML = `<span class="badge-dot"></span>${statusLabel(status, due)}`;

      topRow.appendChild(labelEl);
      topRow.appendChild(badge);
      main.appendChild(topRow);

      if (task.description) {
        const desc = document.createElement("p");
        desc.className = "task-description";
        desc.textContent = task.description;
        main.appendChild(desc);
      }

      const meta = document.createElement("div");
      meta.className = "task-meta";

      if (task.isOneTime) {
        meta.innerHTML = `
          <span>One-time task</span>
          <span>Due: <strong>${formatDateTime(task.dueAt)}</strong></span>
        `;
      } else {
        const onTimeRate = task.totalCompletions > 0
          ? Math.round((task.onTimeCompletions / task.totalCompletions) * 100)
          : null;

        meta.innerHTML = `
          <span>Cadence: <strong>${cadenceLabel(task)}</strong></span>
          <span>Last done: <strong>${task.totalCompletions > 0 ? formatDateTime(task.lastCompletedDisplayAt || task.lastCompletedAt) : "never"}</strong></span>
          <span>Completed: <strong>${task.totalCompletions}</strong></span>
          <span>On time: <strong>${task.onTimeCompletions}${onTimeRate !== null ? ` (${onTimeRate}%)` : ""}</strong></span>
        `;
      }
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const completeBtn = document.createElement("button");
      completeBtn.className = "btn btn-primary";
      completeBtn.textContent = "Complete";
      completeBtn.addEventListener("click", () => completeTask(task.id));

      const editBtn = document.createElement("button");
      editBtn.className = "btn-icon";
      editBtn.title = "Edit task";
      editBtn.setAttribute("aria-label", "Edit task");
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", () => openEditModal(task.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-icon";
      deleteBtn.title = "Delete task";
      deleteBtn.setAttribute("aria-label", "Delete task");
      deleteBtn.textContent = "✕";
      deleteBtn.addEventListener("click", () => openDeleteConfirm(task.id));

      actions.appendChild(completeBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(main);
      li.appendChild(actions);
      taskListEl.appendChild(li);
    }

    renderCalendar();
  }

  function startOfWeek(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  }

  function occurrencesInRange(task, rangeStart, rangeEnd) {
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

  function renderCalendar() {
    const weekStart = startOfWeek(Date.now());
    const weekEnd = weekStart + WEEK_MS;
    const now = Date.now();
    const todayIndex = Math.floor((now - weekStart) / DAY_MS);

    const dayBuckets = Array.from({ length: 7 }, () => []);

    for (const task of tasks) {
      for (const dueAt of occurrencesInRange(task, weekStart, weekEnd)) {
        const dayIndex = Math.min(6, Math.floor((dueAt - weekStart) / DAY_MS));
        dayBuckets[dayIndex].push({ task, dueAt });
      }
    }

    weekCalendarEl.innerHTML = "";

    for (let i = 0; i < 7; i++) {
      const dayStart = weekStart + i * DAY_MS;

      const dayEl = document.createElement("div");
      dayEl.className = "calendar-day" + (i === todayIndex ? " today" : "");

      const header = document.createElement("div");
      header.className = "calendar-day-header";
      header.textContent = `${DAY_NAMES[i]} ${new Date(dayStart).getDate()}`;
      dayEl.appendChild(header);

      const list = document.createElement("div");
      list.className = "calendar-day-tasks";

      const entries = dayBuckets[i].sort((a, b) => a.dueAt - b.dueAt);
      if (entries.length === 0) {
        const empty = document.createElement("span");
        empty.className = "calendar-day-empty";
        empty.textContent = "—";
        list.appendChild(empty);
      } else {
        for (const { task, dueAt } of entries) {
          const chip = document.createElement("span");
          chip.className = "calendar-chip" + (dueAt < now ? " overdue" : "");
          chip.textContent = task.label;
          chip.title = `${task.label} · due ${formatDateTime(dueAt)}`;
          list.appendChild(chip);
        }
      }

      dayEl.appendChild(list);
      weekCalendarEl.appendChild(dayEl);
    }
  }

  function completeTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (task.isOneTime) {
      const now = Date.now();
      const onTime = now - task.dueAt <= LENIENCY_MS;

      completedLog.unshift({
        eventId: makeId(),
        id: task.id,
        label: task.label,
        type: "complete",
        isOneTime: true,
        at: now,
        dueAt: task.dueAt,
        completedAt: now,
        onTime,
        deltaMs: now - task.dueAt,
      });
      saveCompletedLog();

      tasks = tasks.filter((t) => t.id !== id);
      saveTasks();
      render();
      return;
    }

    const previousDue = nextDueAt(task);
    const now = Date.now();
    const delta = now - previousDue; // positive = completed late, negative = completed early
    const onTime = delta <= LENIENCY_MS;

    task.totalCompletions += 1;
    if (onTime) task.onTimeCompletions += 1;
    task.totalDeltaMs = (task.totalDeltaMs || 0) + delta;
    task.lastCompletedAt = now;
    task.lastCompletedDisplayAt = now;

    // Granular, timestamped record of this completion — kept alongside (not
    // instead of) the aggregate counters above, so future work can filter/
    // compare metrics across arbitrary time windows.
    completedLog.unshift({
      eventId: makeId(),
      id: task.id,
      label: task.label,
      type: "complete",
      isOneTime: false,
      at: now,
      dueAt: previousDue,
      completedAt: now,
      onTime,
      deltaMs: delta,
    });
    saveCompletedLog();

    saveTasks();
    render();
  }

  function renderHistory() {
    const oneTimeEvents = completedLog.filter(isOneTimeCompleteEvent);
    const total = oneTimeEvents.length;
    const onTimeCount = oneTimeEvents.filter((e) => e.onTime).length;
    const rate = total > 0 ? Math.round((onTimeCount / total) * 100) : null;

    historyStatsEl.classList.toggle("hidden", total === 0);
    historyStatsEl.innerHTML = total > 0
      ? `
        <span>Completed: <strong>${total}</strong></span>
        <span>On time: <strong>${onTimeCount}${rate !== null ? ` (${rate}%)` : ""}</strong></span>
      `
      : "";

    historyLogEl.innerHTML = "";
    historyEmptyEl.classList.toggle("hidden", total > 0);

    for (const entry of oneTimeEvents.slice(0, MAX_HISTORY_DISPLAY_ENTRIES)) {
      const li = document.createElement("li");
      li.className = "history-entry";

      const main = document.createElement("div");
      main.className = "history-entry-main";

      const label = document.createElement("div");
      label.className = "history-entry-label";
      label.textContent = entry.label;

      const meta = document.createElement("div");
      meta.className = "history-entry-meta";
      meta.textContent = `Due ${formatDateTime(entry.dueAt)} · Completed ${formatDateTime(entry.completedAt)}`;

      main.appendChild(label);
      main.appendChild(meta);

      const badge = document.createElement("span");
      badge.className = `badge ${entry.onTime ? "ok" : "overdue"}`;
      badge.innerHTML = `<span class="badge-dot"></span>${entry.onTime ? "On time" : "Late"}`;

      li.appendChild(main);
      li.appendChild(badge);
      historyLogEl.appendChild(li);
    }
  }

  function openHistoryModal() {
    renderHistory();
    historyModal.classList.remove("hidden");
  }

  function closeHistoryModal() {
    historyModal.classList.add("hidden");
  }

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
    if (metricsRangeKey === "all") return null;
    if (metricsRangeKey === "custom") {
      if (metricsCustomFrom === null || metricsCustomTo === null) return null;
      return { start: metricsCustomFrom, end: metricsCustomTo };
    }
    const months = metricsRangeKey === "1m" ? 1 : metricsRangeKey === "3m" ? 3 : 6;
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    return { start: start.getTime(), end: Date.now() };
  }

  function updateMetricsRangeButtons() {
    for (const btn of metricsRangeFilterEl.querySelectorAll(".filter-btn")) {
      btn.classList.toggle("active", btn.dataset.range === metricsRangeKey);
    }
    metricsCustomRangeEl.classList.toggle("hidden", metricsRangeKey !== "custom");
    metricsRangeNoteEl.classList.toggle("hidden", metricsRangeKey === "all");
  }

  function renderMetrics() {
    updateMetricsRangeButtons();
    const range = getMetricsRangeBounds();
    const recurringTasks = tasks.filter((t) => !t.isOneTime);

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
      const recurringEvents = completedLog.filter(
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
    const oneTimeEvents = completedLog.filter(
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
      taskHealthListEl.appendChild(
        buildHealthRow(
          task.label,
          `${rate}% on time${deltaText ? ` · ${deltaText}` : ""}`,
          rate,
          colorForRate(rate),
          false
        )
      );
    }
    for (const { task } of noData) {
      taskHealthListEl.appendChild(
        buildHealthRow(task.label, range ? "No completions in this range" : "No completions yet", 0, "var(--border)", true)
      );
    }

    renderOneTimeHealth(oneTimeTotal, oneTimeOnTime, oneTimeDelta, Boolean(range));
  }

  function openMetricsModal() {
    renderMetrics();
    metricsModal.classList.remove("hidden");
  }

  function closeMetricsModal() {
    metricsModal.classList.add("hidden");
  }

  function resetImportUi() {
    pendingImportData = null;
    importFileInput.value = "";
    importErrorEl.classList.add("hidden");
    importConfirmEl.classList.add("hidden");
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function renderStorageUsage() {
    const bytes = estimateDataSizeBytes();

    localUsageRowEl.innerHTML = "";
    const localPct = Math.min(100, Math.round((bytes / LOCAL_STORAGE_WARN_BYTES) * 100));
    localUsageRowEl.appendChild(
      buildHealthRow("Local data size", formatBytes(bytes), localPct, colorForRate(100 - localPct), false)
    );

    const showCloud = syncConfigured;
    cloudUsageRowEl.classList.toggle("hidden", !showCloud);
    usageWarningEl.classList.add("hidden");

    if (showCloud) {
      cloudUsageRowEl.innerHTML = "";
      const cloudPct = Math.min(100, Math.round((bytes / FIRESTORE_DOC_LIMIT_BYTES) * 100));
      cloudUsageRowEl.appendChild(
        buildHealthRow("Cloud sync size", `${formatBytes(bytes)} of ~1 MB`, cloudPct, colorForRate(100 - cloudPct), false)
      );

      if (cloudPct >= 70) {
        usageWarningEl.textContent =
          "Approaching the cloud sync size limit. Consider exporting a backup — " +
          "there's no in-app way to trim history yet.";
        usageWarningEl.classList.remove("hidden");
      }
    }
  }

  function openSettingsModal() {
    resetImportUi();
    renderStorageUsage();
    settingsModal.classList.remove("hidden");
  }

  function closeSettingsModal() {
    resetImportUi();
    settingsModal.classList.add("hidden");
  }

  function setSyncStatus(text) {
    syncStatusEl.textContent = text;
  }

  function renderSyncUi() {
    syncUnconfiguredEl.classList.toggle("hidden", syncConfigured);
    syncSignedOutEl.classList.toggle("hidden", !syncConfigured || Boolean(cloudUser));
    syncSignedInEl.classList.toggle("hidden", !syncConfigured || !cloudUser);

    if (cloudUser) {
      syncAccountEmailEl.textContent = cloudUser.email || cloudUser.displayName || "Signed in";
      setSyncStatus("Synced");
    } else {
      syncSignInErrorEl.classList.add("hidden");
    }
  }

  async function handleSignIn() {
    if (!window.TaskSync) return;
    syncSignInErrorEl.classList.add("hidden");
    try {
      await window.TaskSync.signIn();
    } catch (err) {
      console.error("Sign-in failed", err);
      if (err && err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        syncSignInErrorEl.textContent = "Sign-in failed. Please try again.";
        syncSignInErrorEl.classList.remove("hidden");
      }
    }
  }

  async function handleSignOut() {
    if (!window.TaskSync) return;
    await window.TaskSync.signOutUser();
  }

  function startRemoteListener() {
    if (!window.TaskSync) return;
    window.TaskSync.onRemoteChange((remoteData) => {
      tasks = Array.isArray(remoteData.tasks) ? remoteData.tasks : [];
      // completedLog is merged, not replaced: every completion now writes
      // here (not just rare one-time-task completions), so a wholesale
      // overwrite risks losing another device's just-made event.
      completedLog = mergeCompletedLogs(completedLog, Array.isArray(remoteData.completedLog) ? remoteData.completedLog : []);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(completedLog));
      setSyncStatus("Synced");
      render();
    });
  }

  function openSyncConflictModal(remoteData) {
    pendingRemoteConflict = remoteData;
    const remoteTaskCount = Array.isArray(remoteData.tasks) ? remoteData.tasks.length : 0;
    const remoteLogCount = Array.isArray(remoteData.completedLog) ? remoteData.completedLog.length : 0;
    syncConflictTextEl.textContent =
      `Your Google account already has cloud data: ${remoteTaskCount} task(s) and ${remoteLogCount} ` +
      `event${remoteLogCount === 1 ? "" : "s"}. This device has ${tasks.length} task(s) and ` +
      `${completedLog.length} event${completedLog.length === 1 ? "" : "s"}. Which do you want to keep?`;
    syncConflictModal.classList.remove("hidden");
  }

  function closeSyncConflictModal() {
    pendingRemoteConflict = null;
    syncConflictModal.classList.add("hidden");
  }

  async function handleAuthChange(user) {
    cloudUser = user;
    renderSyncUi();

    if (!user) return;

    // Already reconciled this device with this account in a prior session —
    // trust local storage and let the live listener pick up anything new.
    if (localStorage.getItem(SYNCED_UID_KEY) === user.uid) {
      setSyncStatus("Synced");
      startRemoteListener();
      return;
    }

    setSyncStatus("Checking cloud data…");
    let remote = null;
    try {
      remote = await window.TaskSync.fetchRemote();
    } catch (err) {
      console.error("Failed to fetch cloud data", err);
      setSyncStatus("Couldn't reach cloud sync");
      return;
    }

    if (!remote) {
      await window.TaskSync.pushNow({ tasks, completedLog });
      localStorage.setItem(SYNCED_UID_KEY, user.uid);
      setSyncStatus("Synced");
      startRemoteListener();
      return;
    }

    const remoteIsEmpty = (!remote.tasks || remote.tasks.length === 0) && (!remote.completedLog || remote.completedLog.length === 0);
    const localIsEmpty = tasks.length === 0 && completedLog.length === 0;
    if (remoteIsEmpty || localIsEmpty) {
      if (remoteIsEmpty) {
        await window.TaskSync.pushNow({ tasks, completedLog });
      } else {
        tasks = remote.tasks || [];
        completedLog = remote.completedLog || [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(completedLog));
        render();
      }
      localStorage.setItem(SYNCED_UID_KEY, user.uid);
      setSyncStatus("Synced");
      startRemoteListener();
      return;
    }

    setSyncStatus("Action needed");
    openSyncConflictModal(remote);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateInputValue(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function toIcsUtc(ms) {
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

  function icsEscape(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  function foldIcsLine(line) {
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

  function buildIcsForTask(task) {
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

  function downloadIcsForTask(task) {
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

  function openCalendarPromptModal(task) {
    pendingCalendarTask = task;
    calendarPromptTextEl.textContent =
      `Want to add "${task.label}" to your calendar? Download an .ics file to import into ` +
      `Google Calendar, Apple Calendar, Outlook, and more.`;
    calendarPromptModal.classList.remove("hidden");
  }

  function closeCalendarPromptModal() {
    pendingCalendarTask = null;
    calendarPromptModal.classList.add("hidden");
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      tasks,
      completedLog,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);

    const a = document.createElement("a");
    a.href = url;
    a.download = `task-manager-export-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseImportData(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "That file isn't valid JSON." };
    }

    if (Array.isArray(parsed)) {
      return { tasks: parsed, completedLog: [] };
    }
    if (parsed && Array.isArray(parsed.tasks)) {
      return { tasks: parsed.tasks, completedLog: Array.isArray(parsed.completedLog) ? parsed.completedLog : [] };
    }
    return { error: "This file doesn't look like a task export." };
  }

  function handleImportFile() {
    const file = importFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportData(reader.result);

      if (result.error) {
        importErrorEl.textContent = result.error;
        importErrorEl.classList.remove("hidden");
        importConfirmEl.classList.add("hidden");
        pendingImportData = null;
        return;
      }

      importErrorEl.classList.add("hidden");
      pendingImportData = result;
      importConfirmTextEl.textContent =
        `This will replace your current ${tasks.length} task(s) and ${completedLog.length} ` +
        `event${completedLog.length === 1 ? "" : "s"} with ${result.tasks.length} task(s) and ` +
        `${result.completedLog.length} event${result.completedLog.length === 1 ? "" : "s"} ` +
        `from this file. This cannot be undone.`;
      importConfirmEl.classList.remove("hidden");
    };
    reader.onerror = () => {
      importErrorEl.textContent = "Could not read that file.";
      importErrorEl.classList.remove("hidden");
      importConfirmEl.classList.add("hidden");
      pendingImportData = null;
    };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pendingImportData) return;
    tasks = pendingImportData.tasks;
    completedLog = pendingImportData.completedLog;
    saveTasks();
    saveCompletedLog();
    closeSettingsModal();
    render();
  }

  function setOneTimeMode(isOneTime) {
    isOneTimeInput.checked = isOneTime;
    cadenceGroupEl.classList.toggle("hidden", isOneTime);
    dueDateGroupEl.classList.toggle("hidden", !isOneTime);
    if (isOneTime) rescheduleGroupEl.classList.add("hidden");
  }

  function resetRescheduleUi() {
    rescheduleToggleInput.checked = false;
    rescheduleDateGroupEl.classList.add("hidden");
  }

  function openAddModal() {
    modalTitle.textContent = "Add Task";
    taskForm.reset();
    taskIdInput.value = "";
    cadenceCountInput.value = 1;
    cadenceEveryInput.value = 1;
    cadenceUnitInput.value = "day";
    dueDateInput.value = toDatetimeLocalValue(Date.now() + DAY_MS);
    rescheduleGroupEl.classList.add("hidden");
    resetRescheduleUi();
    setOneTimeMode(false);
    taskModal.classList.remove("hidden");
    labelInput.focus();
  }

  function openEditModal(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    modalTitle.textContent = "Edit Task";
    taskIdInput.value = task.id;
    labelInput.value = task.label;
    descriptionInput.value = task.description || "";
    resetRescheduleUi();

    if (task.isOneTime) {
      dueDateInput.value = toDatetimeLocalValue(task.dueAt);
      cadenceCountInput.value = 1;
      cadenceEveryInput.value = 1;
      cadenceUnitInput.value = "day";
      setOneTimeMode(true);
    } else {
      cadenceCountInput.value = task.cadenceCount;
      cadenceEveryInput.value = task.cadenceEvery || 1;
      cadenceUnitInput.value = task.cadenceUnit;
      dueDateInput.value = toDatetimeLocalValue(Date.now() + DAY_MS);
      rescheduleGroupEl.classList.remove("hidden");
      rescheduleDateInput.value = toDatetimeLocalValue(nextDueAt(task));
      setOneTimeMode(false);
    }

    taskModal.classList.remove("hidden");
    labelInput.focus();
  }

  function closeTaskModal() {
    taskModal.classList.add("hidden");
  }

  function openDeleteConfirm(id) {
    pendingDeleteId = id;
    confirmModal.classList.remove("hidden");
  }

  function closeDeleteConfirm() {
    pendingDeleteId = null;
    confirmModal.classList.add("hidden");
  }

  function readCadenceUnit() {
    const value = cadenceUnitInput.value;
    return value === "week" || value === "month" ? value : "day";
  }

  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const id = taskIdInput.value;
    const label = labelInput.value.trim();
    const description = descriptionInput.value.trim();
    const isOneTime = isOneTimeInput.checked;

    if (!label) return;
    if (isOneTime && !dueDateInput.value) return;
    if (!isOneTime && rescheduleToggleInput.checked && !rescheduleDateInput.value) return;

    if (id) {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        // Captured before any field below is mutated — nextDueAt() reads
        // isOneTime/lastCompletedAt/cadenceCount/cadenceEvery/cadenceUnit, all
        // of which are about to change, so this must happen first. Round-trip
        // through the same datetime-local formatting the reschedule field
        // uses (minute precision, no seconds/ms) so an untouched field
        // compares as unchanged rather than falsely differing on precision.
        const originalDueAt = task.isOneTime
          ? null
          : fromDatetimeLocalValue(toDatetimeLocalValue(nextDueAt(task)));

        task.label = label;
        task.description = description;
        task.isOneTime = isOneTime;
        if (isOneTime) {
          task.dueAt = fromDatetimeLocalValue(dueDateInput.value);
          delete task.cadenceCount;
          delete task.cadenceEvery;
          delete task.cadenceUnit;
        } else {
          task.cadenceCount = Math.max(1, parseInt(cadenceCountInput.value, 10) || 1);
          task.cadenceEvery = Math.max(1, parseInt(cadenceEveryInput.value, 10) || 1);
          task.cadenceUnit = readCadenceUnit();
          delete task.dueAt;

          if (rescheduleToggleInput.checked) {
            const newDueAt = fromDatetimeLocalValue(rescheduleDateInput.value);
            task.lastCompletedAt = newDueAt - intervalMs(task.cadenceCount, task.cadenceEvery, task.cadenceUnit);

            // Skip logging when the date field was left unchanged (it's
            // pre-filled with the current due date) — a same-to-same
            // reschedule isn't a real event, just noise in the log.
            if (newDueAt !== originalDueAt) {
              completedLog.unshift({
                eventId: makeId(),
                id: task.id,
                label: task.label,
                type: "reschedule",
                isOneTime: false,
                at: Date.now(),
                fromDueAt: originalDueAt,
                toDueAt: newDueAt,
              });
              saveCompletedLog();
            }
          }
        }
      }
    } else {
      const now = Date.now();
      let newTask;
      if (isOneTime) {
        newTask = {
          id: makeId(),
          label,
          description,
          isOneTime: true,
          dueAt: fromDatetimeLocalValue(dueDateInput.value),
          createdAt: now,
          totalCompletions: 0,
          onTimeCompletions: 0,
        };
      } else {
        newTask = {
          id: makeId(),
          label,
          description,
          isOneTime: false,
          cadenceCount: Math.max(1, parseInt(cadenceCountInput.value, 10) || 1),
          cadenceEvery: Math.max(1, parseInt(cadenceEveryInput.value, 10) || 1),
          cadenceUnit: readCadenceUnit(),
          createdAt: now,
          lastCompletedAt: now,
          totalCompletions: 0,
          onTimeCompletions: 0,
          totalDeltaMs: 0,
        };
      }
      tasks.push(newTask);
      saveTasks();
      closeTaskModal();
      render();
      openCalendarPromptModal(newTask);
      return;
    }

    saveTasks();
    closeTaskModal();
    render();
  });

  isOneTimeInput.addEventListener("change", () => setOneTimeMode(isOneTimeInput.checked));
  rescheduleToggleInput.addEventListener("change", () => {
    rescheduleDateGroupEl.classList.toggle("hidden", !rescheduleToggleInput.checked);
  });
  addTaskBtn.addEventListener("click", openAddModal);

  statusFiltersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    statusFilter = btn.dataset.filter;
    render();
  });
  cancelBtn.addEventListener("click", closeTaskModal);
  taskModal.addEventListener("click", (e) => {
    if (e.target === taskModal) closeTaskModal();
  });

  confirmDeleteBtn.addEventListener("click", () => {
    if (pendingDeleteId) {
      tasks = tasks.filter((t) => t.id !== pendingDeleteId);
      saveTasks();
      render();
    }
    closeDeleteConfirm();
  });
  confirmCancelBtn.addEventListener("click", closeDeleteConfirm);
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeDeleteConfirm();
  });

  historyBtn.addEventListener("click", openHistoryModal);
  historyCloseBtn.addEventListener("click", closeHistoryModal);
  historyModal.addEventListener("click", (e) => {
    if (e.target === historyModal) closeHistoryModal();
  });

  metricsBtn.addEventListener("click", openMetricsModal);
  metricsCloseBtn.addEventListener("click", closeMetricsModal);
  metricsModal.addEventListener("click", (e) => {
    if (e.target === metricsModal) closeMetricsModal();
  });

  metricsRangeFilterEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    metricsRangeKey = btn.dataset.range;
    if (metricsRangeKey === "custom") {
      if (metricsCustomFrom !== null) metricsRangeFromInput.value = toDateInputValue(metricsCustomFrom);
      if (metricsCustomTo !== null) metricsRangeToInput.value = toDateInputValue(metricsCustomTo);
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
    metricsCustomFrom = start;
    metricsCustomTo = end;
    metricsRangeKey = "custom";
    renderMetrics();
  });

  settingsBtn.addEventListener("click", openSettingsModal);
  settingsCloseBtn.addEventListener("click", closeSettingsModal);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  exportBtn.addEventListener("click", exportData);
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", handleImportFile);
  importCancelBtn.addEventListener("click", resetImportUi);
  importConfirmBtn.addEventListener("click", confirmImport);

  signInBtn.addEventListener("click", handleSignIn);
  signOutBtn.addEventListener("click", handleSignOut);

  async function cancelSyncConflict() {
    closeSyncConflictModal();
    await handleSignOut();
  }

  syncConflictCancelBtn.addEventListener("click", cancelSyncConflict);
  syncConflictModal.addEventListener("click", (e) => {
    if (e.target === syncConflictModal) cancelSyncConflict();
  });
  syncUseLocalBtn.addEventListener("click", async () => {
    // "Use This Device" picks this device's tasks, but the completion/
    // reschedule history is still merged (not discarded) — an event log
    // shouldn't lose entries just because the *task list* conflicted.
    if (pendingRemoteConflict) {
      completedLog = mergeCompletedLogs(completedLog, pendingRemoteConflict.completedLog || []);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(completedLog));
    }
    closeSyncConflictModal();
    setSyncStatus("Syncing…");
    await window.TaskSync.pushNow({ tasks, completedLog });
    if (cloudUser) localStorage.setItem(SYNCED_UID_KEY, cloudUser.uid);
    setSyncStatus("Synced");
    render();
    startRemoteListener();
  });
  syncUseCloudBtn.addEventListener("click", () => {
    if (!pendingRemoteConflict) return;
    tasks = pendingRemoteConflict.tasks || [];
    // Same reasoning as above: tasks take the cloud's version outright, but
    // completedLog is merged so this device's own events aren't discarded.
    completedLog = mergeCompletedLogs(completedLog, pendingRemoteConflict.completedLog || []);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(completedLog));
    if (cloudUser) localStorage.setItem(SYNCED_UID_KEY, cloudUser.uid);
    closeSyncConflictModal();
    setSyncStatus("Synced");
    render();
    startRemoteListener();
  });

  window.addEventListener("tasksync:ready", (e) => {
    syncConfigured = e.detail.configured;
    renderSyncUi();
  });
  window.addEventListener("tasksync:authchange", (e) => {
    handleAuthChange(e.detail.user);
  });
  window.addEventListener("tasksync:error", () => {
    setSyncStatus("Sync error — will retry");
  });

  calendarPromptSkipBtn.addEventListener("click", closeCalendarPromptModal);
  calendarPromptDownloadBtn.addEventListener("click", () => {
    if (pendingCalendarTask) downloadIcsForTask(pendingCalendarTask);
    closeCalendarPromptModal();
  });
  calendarPromptModal.addEventListener("click", (e) => {
    if (e.target === calendarPromptModal) closeCalendarPromptModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTaskModal();
      closeDeleteConfirm();
      closeHistoryModal();
      closeMetricsModal();
      closeSettingsModal();
      closeCalendarPromptModal();
      if (!syncConflictModal.classList.contains("hidden")) cancelSyncConflict();
    }
  });

  render();
  setInterval(render, 60 * 1000);
})();
