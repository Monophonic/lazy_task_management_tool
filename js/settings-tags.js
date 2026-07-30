import { LOCAL_STORAGE_WARN_BYTES, FIRESTORE_DOC_LIMIT_BYTES } from "./constants.js";
import { colorForRate, buildHealthRow } from "./presentation.js";
import { state, saveTasks, saveTags, saveCompletedLog } from "./state.js";
import { estimateDataSizeBytes, formatBytes, parseImportData } from "./storage.js";
import {
  settingsBtn,
  settingsModal,
  settingsCloseBtn,
  localUsageRowEl,
  cloudUsageRowEl,
  usageWarningEl,
  exportBtn,
  importBtn,
  importFileInput,
  importErrorEl,
  importConfirmEl,
  importConfirmTextEl,
  importCancelBtn,
  importConfirmBtn,
  newTagInput,
  addTagBtn,
  tagAddErrorEl,
  tagManageListEl,
  tagManageEmptyEl,
} from "./dom.js";
import { render } from "./task-list.js";

export function resetImportUi() {
  state.pendingImportData = null;
  importFileInput.value = "";
  importErrorEl.classList.add("hidden");
  importConfirmEl.classList.add("hidden");
}

export function renderStorageUsage() {
  const bytes = estimateDataSizeBytes(state.tasks, state.completedLog, state.tags);

  localUsageRowEl.innerHTML = "";
  const localPct = Math.min(100, Math.round((bytes / LOCAL_STORAGE_WARN_BYTES) * 100));
  localUsageRowEl.appendChild(
    buildHealthRow("Local data size", formatBytes(bytes), localPct, colorForRate(100 - localPct), false)
  );

  const showCloud = state.syncConfigured;
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

export function renderTagManageList() {
  tagAddErrorEl.classList.add("hidden");
  tagManageListEl.innerHTML = "";
  tagManageEmptyEl.classList.toggle("hidden", state.tags.length > 0);

  for (const tag of state.tags) {
    const row = document.createElement("div");
    row.className = "tag-manage-row";

    const label = document.createElement("span");
    label.className = "tag-manage-label";
    label.textContent = tag;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-icon";
    removeBtn.title = `Remove tag "${tag}"`;
    removeBtn.setAttribute("aria-label", `Remove tag ${tag}`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => removeTag(tag));

    row.appendChild(label);
    row.appendChild(removeBtn);
    tagManageListEl.appendChild(row);
  }
}

export function addTag() {
  const raw = newTagInput.value.trim();
  if (!raw) return;

  const exists = state.tags.some((t) => t.toLowerCase() === raw.toLowerCase());
  if (exists) {
    tagAddErrorEl.textContent = `A tag named "${raw}" already exists.`;
    tagAddErrorEl.classList.remove("hidden");
    return;
  }

  state.tags.push(raw);
  saveTags();
  newTagInput.value = "";
  renderTagManageList();
  render();
}

export function removeTag(tag) {
  state.tags = state.tags.filter((t) => t !== tag);
  saveTags();

  // Un-tag any tasks that referenced the removed tag, so nothing points at
  // a tag that no longer exists.
  let changed = false;
  for (const task of state.tasks) {
    if (task.tag === tag) {
      delete task.tag;
      changed = true;
    }
  }
  if (changed) saveTasks();

  if (state.activeFilter.type === "tag" && state.activeFilter.value === tag) {
    state.activeFilter = { type: "status", value: "all" };
  }

  renderTagManageList();
  render();
}

export function openSettingsModal() {
  resetImportUi();
  renderStorageUsage();
  renderTagManageList();
  settingsModal.classList.remove("hidden");
}

export function closeSettingsModal() {
  resetImportUi();
  settingsModal.classList.add("hidden");
}

export function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
    completedLog: state.completedLog,
    tags: state.tags,
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
      state.pendingImportData = null;
      return;
    }

    importErrorEl.classList.add("hidden");
    state.pendingImportData = result;
    importConfirmTextEl.textContent =
      `This will replace your current ${state.tasks.length} task(s) and ${state.completedLog.length} ` +
      `event${state.completedLog.length === 1 ? "" : "s"} with ${result.tasks.length} task(s) and ` +
      `${result.completedLog.length} event${result.completedLog.length === 1 ? "" : "s"} ` +
      `from this file. This cannot be undone.`;
    importConfirmEl.classList.remove("hidden");
  };
  reader.onerror = () => {
    importErrorEl.textContent = "Could not read that file.";
    importErrorEl.classList.remove("hidden");
    importConfirmEl.classList.add("hidden");
    state.pendingImportData = null;
  };
  reader.readAsText(file);
}

function confirmImport() {
  if (!state.pendingImportData) return;
  state.tasks = state.pendingImportData.tasks;
  state.completedLog = state.pendingImportData.completedLog;
  state.tags = state.pendingImportData.tags || [];
  saveTasks();
  saveCompletedLog();
  saveTags();
  closeSettingsModal();
  render();
}

export function initSettings() {
  settingsBtn.addEventListener("click", openSettingsModal);
  settingsCloseBtn.addEventListener("click", closeSettingsModal);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  addTagBtn.addEventListener("click", addTag);
  newTagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  });

  exportBtn.addEventListener("click", exportData);
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", handleImportFile);
  importCancelBtn.addEventListener("click", resetImportUi);
  importConfirmBtn.addEventListener("click", confirmImport);
}
