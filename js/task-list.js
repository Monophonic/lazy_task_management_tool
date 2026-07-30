import { WEEK_MS, DAY_MS, DAY_NAMES } from "./constants.js";
import { nextDueAt, getStatus, cadenceLabel, formatDateTime, startOfWeek, occurrencesInRange } from "./date-time.js";
import { statusLabel } from "./presentation.js";
import { state } from "./state.js";
import { statusFiltersEl, tagFilterButtonsEl, taskListEl, emptyStateEl, weekCalendarEl } from "./dom.js";

// Wires only what task-list.js can own without importing task-actions.js/
// task-form.js (which both import `render` from here — importing them back
// would be circular). The Add Task button and the per-card action buttons
// are wired from the entry point instead; see js/app.js.
export function initTaskList() {
  statusFiltersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    state.activeFilter = btn.dataset.tag !== undefined
      ? { type: "tag", value: btn.dataset.tag }
      : { type: "status", value: btn.dataset.filter };
    render();
  });
}

export function updateFilterBar(entries) {
  const counts = { all: entries.length, overdue: 0, "due-soon": 0, ok: 0 };
  for (const { status } of entries) counts[status] += 1;

  for (const btn of statusFiltersEl.querySelectorAll(".filter-btn[data-filter]")) {
    const filter = btn.dataset.filter;
    btn.classList.toggle("active", state.activeFilter.type === "status" && state.activeFilter.value === filter);
    btn.querySelector(".filter-count").textContent = `(${counts[filter]})`;
  }

  const tagCounts = new Map(state.tags.map((t) => [t, 0]));
  for (const { task } of entries) {
    if (task.tag && tagCounts.has(task.tag)) tagCounts.set(task.tag, tagCounts.get(task.tag) + 1);
  }

  tagFilterButtonsEl.innerHTML = "";
  for (const tag of state.tags) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "badge filter-btn" + (state.activeFilter.type === "tag" && state.activeFilter.value === tag ? " active" : "");
    btn.dataset.tag = tag;
    btn.appendChild(document.createTextNode(`${tag} `));
    const countSpan = document.createElement("span");
    countSpan.className = "filter-count";
    countSpan.textContent = `(${tagCounts.get(tag) || 0})`;
    btn.appendChild(countSpan);
    tagFilterButtonsEl.appendChild(btn);
  }
}

// Card buttons carry data-action (and rely on the card's own data-id) rather
// than each having a listener attached here — this keeps this module a true
// dependency leaf with no import from task-actions.js/task-form.js, whose
// completeTask/resolveTask/openDeleteConfirm/openEditModal all need to call
// render() back after mutating. A single delegated listener (in the entry
// point) reads these attributes and dispatches to the right function.
export function render() {
  const entries = state.tasks
    .map((task) => ({ task, due: nextDueAt(task), status: getStatus(task) }))
    .sort((a, b) => a.due - b.due);

  updateFilterBar(entries);

  const visible = entries.filter((e) => {
    if (state.activeFilter.type === "tag") return e.task.tag === state.activeFilter.value;
    return state.activeFilter.value === "all" || e.status === state.activeFilter.value;
  });

  taskListEl.innerHTML = "";
  emptyStateEl.classList.toggle("hidden", visible.length > 0);
  emptyStateEl.querySelector("p").textContent = state.tasks.length === 0
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
    if (task.tag) {
      const tagChip = document.createElement("span");
      tagChip.className = "task-tag-chip";
      tagChip.textContent = task.tag;
      topRow.appendChild(tagChip);
    }
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
    completeBtn.dataset.action = "complete";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-icon";
    editBtn.title = "Edit task";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.textContent = "✎";
    editBtn.dataset.action = "edit";

    const resolveBtn = document.createElement("button");
    resolveBtn.className = "btn-icon";
    resolveBtn.title = "Resolve without completing";
    resolveBtn.setAttribute("aria-label", "Resolve task without completing");
    resolveBtn.textContent = "⊘";
    resolveBtn.dataset.action = "resolve";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon";
    deleteBtn.title = "Delete task";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.textContent = "✕";
    deleteBtn.dataset.action = "delete";

    actions.appendChild(completeBtn);
    actions.appendChild(editBtn);
    actions.appendChild(resolveBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(main);
    li.appendChild(actions);
    taskListEl.appendChild(li);
  }

  renderCalendar();
}

export function renderCalendar() {
  const weekStart = startOfWeek(Date.now());
  const weekEnd = weekStart + WEEK_MS;
  const now = Date.now();
  const todayIndex = Math.floor((now - weekStart) / DAY_MS);

  const dayBuckets = Array.from({ length: 7 }, () => []);

  for (const task of state.tasks) {
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
