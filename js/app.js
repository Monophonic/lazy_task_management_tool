import { render, initTaskList } from "./task-list.js";
import {
  completeTask,
  openDeleteConfirm,
  closeDeleteConfirm,
  openResolveConfirm,
  closeResolveConfirm,
  initTaskActions,
} from "./task-actions.js";
import { openEditModal, closeTaskModal, closeCalendarPromptModal, initTaskForm } from "./task-form.js";
import { closeHistoryModal, initHistory } from "./history.js";
import { closeMetricsModal, closeResolvedReasonsModal, closeTimeOfDayTaskModal, initMetrics } from "./metrics.js";
import { closeSettingsModal, initSettings } from "./settings-tags.js";
import { cancelSyncConflict, initCloudSync } from "./cloud-sync-ui.js";
import { taskListEl, syncConflictModal } from "./dom.js";

// Delegated once on the list container rather than per-card-button: render()
// (task-list.js) sets data-action on each button instead of attaching its
// own listeners, so it never has to import completeTask/openEditModal/
// openResolveConfirm/openDeleteConfirm (which all call back into render()).
taskListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.closest(".task-card").dataset.id;
  if (btn.dataset.action === "complete") completeTask(id);
  else if (btn.dataset.action === "edit") openEditModal(id);
  else if (btn.dataset.action === "resolve") openResolveConfirm(id);
  else if (btn.dataset.action === "delete") openDeleteConfirm(id);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeTaskModal();
    closeDeleteConfirm();
    closeResolveConfirm();
    closeHistoryModal();
    closeMetricsModal();
    closeResolvedReasonsModal();
    closeTimeOfDayTaskModal();
    closeSettingsModal();
    closeCalendarPromptModal();
    if (!syncConflictModal.classList.contains("hidden")) cancelSyncConflict();
  }
});

initTaskList();
initTaskActions();
initTaskForm();
initHistory();
initMetrics();
initSettings();
initCloudSync();

render();
setInterval(render, 60 * 1000);
