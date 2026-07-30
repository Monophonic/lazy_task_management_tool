import { LENIENCY_MS } from "./constants.js";
import { makeId, nextDueAt } from "./date-time.js";
import { state, saveTasks, saveCompletedLog } from "./state.js";
import {
  confirmModal,
  confirmDeleteBtn,
  confirmCancelBtn,
  resolveModal,
  resolveTextEl,
  resolveReasonInput,
  resolveReasonErrorEl,
  resolveCancelBtn,
  resolveConfirmBtn,
} from "./dom.js";
import { render } from "./task-list.js";

export function completeTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  if (task.isOneTime) {
    const now = Date.now();
    const onTime = now - task.dueAt <= LENIENCY_MS;

    state.completedLog.unshift({
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

    state.tasks = state.tasks.filter((t) => t.id !== id);
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
  state.completedLog.unshift({
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

export function resolveTask(id, reason) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  if (task.isOneTime) {
    state.completedLog.unshift({
      eventId: makeId(),
      id: task.id,
      label: task.label,
      type: "resolved",
      isOneTime: true,
      at: Date.now(),
      dueAt: task.dueAt,
      reason,
    });
    saveCompletedLog();

    state.tasks = state.tasks.filter((t) => t.id !== id);
    saveTasks();
    render();
    return;
  }

  const previousDue = nextDueAt(task);
  const now = Date.now();

  // Advances the schedule anchor only — deliberately does NOT touch
  // lastCompletedDisplayAt/totalCompletions/onTimeCompletions/totalDeltaMs,
  // since those track the user's own follow-through and this occurrence
  // wasn't completed by them. Mirrors the reschedule feature's anchor-vs-
  // display split.
  task.lastCompletedAt = now;

  state.completedLog.unshift({
    eventId: makeId(),
    id: task.id,
    label: task.label,
    type: "resolved",
    isOneTime: false,
    at: now,
    dueAt: previousDue,
    reason,
  });
  saveCompletedLog();

  saveTasks();
  render();
}

export function openDeleteConfirm(id) {
  state.pendingDeleteId = id;
  confirmModal.classList.remove("hidden");
}

export function closeDeleteConfirm() {
  state.pendingDeleteId = null;
  confirmModal.classList.add("hidden");
}

export function confirmDelete() {
  if (state.pendingDeleteId) {
    state.tasks = state.tasks.filter((t) => t.id !== state.pendingDeleteId);
    saveTasks();
    render();
  }
  closeDeleteConfirm();
}

export function openResolveConfirm(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  state.pendingResolveId = id;
  resolveReasonInput.value = "";
  resolveReasonErrorEl.classList.add("hidden");
  resolveTextEl.textContent = task.isOneTime
    ? "Mark this task as resolved without completing it. This removes it from your list and cannot be undone."
    : "Mark this occurrence as resolved without completing it yourself. The task keeps recurring as normal — this occurrence just won't count toward your own completion stats.";
  resolveModal.classList.remove("hidden");
  resolveReasonInput.focus();
}

export function closeResolveConfirm() {
  state.pendingResolveId = null;
  resolveModal.classList.add("hidden");
}

export function initTaskActions() {
  confirmDeleteBtn.addEventListener("click", confirmDelete);
  confirmCancelBtn.addEventListener("click", closeDeleteConfirm);
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeDeleteConfirm();
  });

  resolveConfirmBtn.addEventListener("click", () => {
    if (!state.pendingResolveId) return;
    const reason = resolveReasonInput.value.trim();
    if (!reason) {
      resolveReasonErrorEl.classList.remove("hidden");
      resolveReasonInput.focus();
      return;
    }
    resolveTask(state.pendingResolveId, reason);
    closeResolveConfirm();
  });
  resolveCancelBtn.addEventListener("click", closeResolveConfirm);
  resolveModal.addEventListener("click", (e) => {
    if (e.target === resolveModal) closeResolveConfirm();
  });
}
