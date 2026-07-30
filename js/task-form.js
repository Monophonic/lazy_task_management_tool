import { DAY_MS } from "./constants.js";
import { makeId, intervalMs, nextDueAt, toDatetimeLocalValue, fromDatetimeLocalValue } from "./date-time.js";
import { state, saveTasks, saveCompletedLog } from "./state.js";
import { downloadIcsForTask, buildGoogleCalendarUrl } from "./ics.js";
import {
  taskModal,
  modalTitle,
  taskForm,
  taskIdInput,
  labelInput,
  descriptionInput,
  taskTagInput,
  cadenceCountInput,
  cadenceEveryInput,
  cadenceUnitInput,
  isOneTimeInput,
  cadenceGroupEl,
  dueDateGroupEl,
  dueDateInput,
  rescheduleGroupEl,
  rescheduleToggleInput,
  rescheduleDateGroupEl,
  rescheduleDateInput,
  cancelBtn,
  addTaskBtn,
  calendarPromptModal,
  calendarPromptTextEl,
  calendarPromptSkipBtn,
  calendarPromptGoogleBtn,
  calendarPromptDownloadBtn,
} from "./dom.js";
import { render } from "./task-list.js";

export function setOneTimeMode(isOneTime) {
  isOneTimeInput.checked = isOneTime;
  cadenceGroupEl.classList.toggle("hidden", isOneTime);
  dueDateGroupEl.classList.toggle("hidden", !isOneTime);
  if (isOneTime) rescheduleGroupEl.classList.add("hidden");
}

export function resetRescheduleUi() {
  rescheduleToggleInput.checked = false;
  rescheduleDateGroupEl.classList.add("hidden");
}

export function populateTagSelect(selectedTag) {
  taskTagInput.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No tag";
  taskTagInput.appendChild(noneOpt);
  for (const tag of state.tags) {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag;
    taskTagInput.appendChild(opt);
  }
  taskTagInput.value = selectedTag || "";
}

export function openAddModal() {
  modalTitle.textContent = "Add Task";
  taskForm.reset();
  taskIdInput.value = "";
  populateTagSelect("");
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

export function openEditModal(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  modalTitle.textContent = "Edit Task";
  taskIdInput.value = task.id;
  labelInput.value = task.label;
  descriptionInput.value = task.description || "";
  populateTagSelect(task.tag || "");
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

export function closeTaskModal() {
  taskModal.classList.add("hidden");
}

export function readCadenceUnit() {
  const value = cadenceUnitInput.value;
  return value === "week" || value === "month" ? value : "day";
}

export function openCalendarPromptModal(task) {
  state.pendingCalendarTask = task;
  calendarPromptTextEl.textContent =
    `Want to add "${task.label}" to your calendar? Add it straight to Google Calendar, ` +
    `or download an .ics file to import into Apple Calendar, Outlook, and more.`;
  calendarPromptModal.classList.remove("hidden");
}

export function closeCalendarPromptModal() {
  state.pendingCalendarTask = null;
  calendarPromptModal.classList.add("hidden");
}

function handleTaskFormSubmit(e) {
  e.preventDefault();

  const id = taskIdInput.value;
  const label = labelInput.value.trim();
  const description = descriptionInput.value.trim();
  const tagValue = taskTagInput.value;
  const isOneTime = isOneTimeInput.checked;

  if (!label) return;
  if (isOneTime && !dueDateInput.value) return;
  if (!isOneTime && rescheduleToggleInput.checked && !rescheduleDateInput.value) return;

  if (id) {
    const task = state.tasks.find((t) => t.id === id);
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
      if (tagValue) task.tag = tagValue;
      else delete task.tag;
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
            state.completedLog.unshift({
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
        tag: tagValue || undefined,
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
        tag: tagValue || undefined,
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
    state.tasks.push(newTask);
    saveTasks();
    closeTaskModal();
    render();
    openCalendarPromptModal(newTask);
    return;
  }

  saveTasks();
  closeTaskModal();
  render();
}

export function initTaskForm() {
  taskForm.addEventListener("submit", handleTaskFormSubmit);
  isOneTimeInput.addEventListener("change", () => setOneTimeMode(isOneTimeInput.checked));
  rescheduleToggleInput.addEventListener("change", () => {
    rescheduleDateGroupEl.classList.toggle("hidden", !rescheduleToggleInput.checked);
  });
  addTaskBtn.addEventListener("click", openAddModal);
  cancelBtn.addEventListener("click", closeTaskModal);
  taskModal.addEventListener("click", (e) => {
    if (e.target === taskModal) closeTaskModal();
  });

  calendarPromptSkipBtn.addEventListener("click", closeCalendarPromptModal);
  calendarPromptGoogleBtn.addEventListener("click", () => {
    if (state.pendingCalendarTask) {
      window.open(buildGoogleCalendarUrl(state.pendingCalendarTask), "_blank", "noopener,noreferrer");
    }
    closeCalendarPromptModal();
  });
  calendarPromptDownloadBtn.addEventListener("click", () => {
    if (state.pendingCalendarTask) downloadIcsForTask(state.pendingCalendarTask);
    closeCalendarPromptModal();
  });
  calendarPromptModal.addEventListener("click", (e) => {
    if (e.target === calendarPromptModal) closeCalendarPromptModal();
  });
}
