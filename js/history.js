import { MAX_HISTORY_DISPLAY_ENTRIES } from "./constants.js";
import { formatDateTime } from "./date-time.js";
import { state } from "./state.js";
import { isOneTimeCompleteEvent } from "./storage.js";
import { historyBtn, historyModal, historyCloseBtn, historyStatsEl, historyLogEl, historyEmptyEl } from "./dom.js";

export function renderHistory() {
  const oneTimeEvents = state.completedLog.filter(isOneTimeCompleteEvent);
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

export function openHistoryModal() {
  renderHistory();
  historyModal.classList.remove("hidden");
}

export function closeHistoryModal() {
  historyModal.classList.add("hidden");
}

export function initHistory() {
  historyBtn.addEventListener("click", openHistoryModal);
  historyCloseBtn.addEventListener("click", closeHistoryModal);
  historyModal.addEventListener("click", (e) => {
    if (e.target === historyModal) closeHistoryModal();
  });
}
