import { STORAGE_KEY, HISTORY_STORAGE_KEY, TAGS_STORAGE_KEY, SYNCED_UID_KEY, LAST_LOCAL_CHANGE_KEY } from "./constants.js";
import { state } from "./state.js";
import { mergeCompletedLogs } from "./storage.js";
import {
  syncUnconfiguredEl,
  syncSignedOutEl,
  syncSignedInEl,
  syncAccountEmailEl,
  syncStatusEl,
  syncSignInErrorEl,
  signInBtn,
  signOutBtn,
  syncConflictModal,
  syncConflictTextEl,
  syncConflictCancelBtn,
  syncUseLocalBtn,
  syncUseCloudBtn,
} from "./dom.js";
import { render } from "./task-list.js";

export function setSyncStatus(text) {
  syncStatusEl.textContent = text;
}

export function renderSyncUi() {
  syncUnconfiguredEl.classList.toggle("hidden", state.syncConfigured);
  syncSignedOutEl.classList.toggle("hidden", !state.syncConfigured || Boolean(state.cloudUser));
  syncSignedInEl.classList.toggle("hidden", !state.syncConfigured || !state.cloudUser);

  if (state.cloudUser) {
    syncAccountEmailEl.textContent = state.cloudUser.email || state.cloudUser.displayName || "Signed in";
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

export function startRemoteListener() {
  if (!window.TaskSync) return;
  window.TaskSync.onRemoteChange((remoteData) => {
    // Guards against a specific race: saveTasks()/saveCompletedLog()/
    // saveTags() write to localStorage immediately but debounce the
    // Firestore push (sync.js), so a change made just before a reload can
    // still be sitting unpushed when this listener attaches. Its first
    // snapshot would then be Firestore's stale, pre-change document —
    // applying it here would silently erase that newer local change. If
    // this device's last local edit is newer than what Firestore has
    // confirmed, push now instead of overwriting; the confirmed snapshot
    // that follows will be safe to apply.
    const remoteUpdatedAtMs =
      remoteData.updatedAt && typeof remoteData.updatedAt.toMillis === "function"
        ? remoteData.updatedAt.toMillis()
        : 0;
    const lastLocalChangeAtMs = Number(localStorage.getItem(LAST_LOCAL_CHANGE_KEY)) || 0;
    if (lastLocalChangeAtMs > remoteUpdatedAtMs) {
      window.TaskSync.pushNow({ tasks: state.tasks, completedLog: state.completedLog, tags: state.tags });
      return;
    }

    state.tasks = Array.isArray(remoteData.tasks) ? remoteData.tasks : [];
    // completedLog is merged, not replaced: every completion now writes
    // here (not just rare one-time-task completions), so a wholesale
    // overwrite risks losing another device's just-made event.
    state.completedLog = mergeCompletedLogs(state.completedLog, Array.isArray(remoteData.completedLog) ? remoteData.completedLog : []);
    state.tags = Array.isArray(remoteData.tags) ? remoteData.tags : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.completedLog));
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(state.tags));
    setSyncStatus("Synced");
    render();
  });
}

function openSyncConflictModal(remoteData) {
  state.pendingRemoteConflict = remoteData;
  const remoteTaskCount = Array.isArray(remoteData.tasks) ? remoteData.tasks.length : 0;
  const remoteLogCount = Array.isArray(remoteData.completedLog) ? remoteData.completedLog.length : 0;
  syncConflictTextEl.textContent =
    `Your Google account already has cloud data: ${remoteTaskCount} task(s) and ${remoteLogCount} ` +
    `event${remoteLogCount === 1 ? "" : "s"}. This device has ${state.tasks.length} task(s) and ` +
    `${state.completedLog.length} event${state.completedLog.length === 1 ? "" : "s"}. Which do you want to keep?`;
  syncConflictModal.classList.remove("hidden");
}

function closeSyncConflictModal() {
  state.pendingRemoteConflict = null;
  syncConflictModal.classList.add("hidden");
}

export async function handleAuthChange(user) {
  state.cloudUser = user;
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
    await window.TaskSync.pushNow({ tasks: state.tasks, completedLog: state.completedLog, tags: state.tags });
    localStorage.setItem(SYNCED_UID_KEY, user.uid);
    setSyncStatus("Synced");
    startRemoteListener();
    return;
  }

  const remoteIsEmpty = (!remote.tasks || remote.tasks.length === 0) && (!remote.completedLog || remote.completedLog.length === 0);
  const localIsEmpty = state.tasks.length === 0 && state.completedLog.length === 0;
  if (remoteIsEmpty || localIsEmpty) {
    if (remoteIsEmpty) {
      await window.TaskSync.pushNow({ tasks: state.tasks, completedLog: state.completedLog, tags: state.tags });
    } else {
      state.tasks = remote.tasks || [];
      state.completedLog = remote.completedLog || [];
      state.tags = remote.tags || [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.completedLog));
      localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(state.tags));
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

export async function cancelSyncConflict() {
  closeSyncConflictModal();
  await handleSignOut();
}

// "Use This Device" picks this device's tasks, but the completion/
// reschedule history is still merged (not discarded) — an event log
// shouldn't lose entries just because the *task list* conflicted.
async function resolveConflictUseLocal() {
  if (state.pendingRemoteConflict) {
    state.completedLog = mergeCompletedLogs(state.completedLog, state.pendingRemoteConflict.completedLog || []);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.completedLog));
  }
  closeSyncConflictModal();
  setSyncStatus("Syncing…");
  await window.TaskSync.pushNow({ tasks: state.tasks, completedLog: state.completedLog, tags: state.tags });
  if (state.cloudUser) localStorage.setItem(SYNCED_UID_KEY, state.cloudUser.uid);
  setSyncStatus("Synced");
  render();
  startRemoteListener();
}

function resolveConflictUseCloud() {
  if (!state.pendingRemoteConflict) return;
  state.tasks = state.pendingRemoteConflict.tasks || [];
  // Same reasoning as above: tasks take the cloud's version outright, but
  // completedLog is merged so this device's own events aren't discarded.
  state.completedLog = mergeCompletedLogs(state.completedLog, state.pendingRemoteConflict.completedLog || []);
  state.tags = state.pendingRemoteConflict.tags || [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.completedLog));
  localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(state.tags));
  if (state.cloudUser) localStorage.setItem(SYNCED_UID_KEY, state.cloudUser.uid);
  closeSyncConflictModal();
  setSyncStatus("Synced");
  render();
  startRemoteListener();
}

export function initCloudSync() {
  signInBtn.addEventListener("click", handleSignIn);
  signOutBtn.addEventListener("click", handleSignOut);

  syncConflictCancelBtn.addEventListener("click", cancelSyncConflict);
  syncConflictModal.addEventListener("click", (e) => {
    if (e.target === syncConflictModal) cancelSyncConflict();
  });
  syncUseLocalBtn.addEventListener("click", resolveConflictUseLocal);
  syncUseCloudBtn.addEventListener("click", resolveConflictUseCloud);

  window.addEventListener("tasksync:ready", (e) => {
    state.syncConfigured = e.detail.configured;
    renderSyncUi();
  });
  window.addEventListener("tasksync:authchange", (e) => {
    handleAuthChange(e.detail.user);
  });
  window.addEventListener("tasksync:error", () => {
    setSyncStatus("Sync error — will retry");
  });
}
