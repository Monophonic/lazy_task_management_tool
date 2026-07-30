import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let auth = null;
let db = null;
let currentUser = null;
let unsubscribeSnapshot = null;
let pushTimer = null;

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
    window.dispatchEvent(new CustomEvent("tasksync:authchange", { detail: { user } }));
  });
}

async function signIn() {
  if (!auth) throw new Error("Cloud sync is not configured.");
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

async function signOutUser() {
  if (!auth) return;
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  await firebaseSignOut(auth);
}

function userDocRef() {
  if (!db || !currentUser) return null;
  return doc(db, "users", currentUser.uid);
}

async function fetchRemote() {
  const ref = userDocRef();
  if (!ref) return null;
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

function pushNow(data) {
  const ref = userDocRef();
  if (!ref) return Promise.resolve();
  return setDoc(ref, { ...data, updatedAt: serverTimestamp() }).catch((err) => {
    console.error("Cloud sync push failed", err);
    window.dispatchEvent(new CustomEvent("tasksync:error", { detail: { error: err } }));
  });
}

function push(data) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow(data), 800);
}

function onRemoteChange(callback) {
  const ref = userDocRef();
  if (!ref) return;
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = onSnapshot(ref, (snap) => {
    if (snap.metadata.hasPendingWrites) return; // ignore the echo of our own writes
    if (!snap.exists()) return;
    callback(snap.data());
  });
}

window.TaskSync = {
  isConfigured: isFirebaseConfigured,
  signIn,
  signOutUser,
  fetchRemote,
  push,
  pushNow,
  onRemoteChange,
  getCurrentUser: () => currentUser,
};

window.dispatchEvent(new CustomEvent("tasksync:ready", { detail: { configured: isFirebaseConfigured } }));
