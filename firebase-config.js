// Fill in these values with your own Firebase project's web app config.
// Get them from: Firebase Console -> Project Settings -> General -> Your apps -> Web app
//
// This file is safe to commit publicly. These values identify which Firebase
// project to talk to -- they are not secrets. Access is controlled by
// Firestore Security Rules and the Google sign-in flow itself, not by hiding
// this config. See README.md for full setup instructions.
export const firebaseConfig = {
  apiKey: "AIzaSyDL-hOfzm41eCxEYhI0vCsVeJOW7m2qzpo",
  authDomain: "lazy-management-tool.firebaseapp.com",
  projectId: "lazy-management-tool",
  storageBucket: "lazy-management-tool.firebasestorage.app",
  messagingSenderId: "108993239287",
  appId: "1:108993239287:web:3cd4fc97e21d8a77075bf2",
  measurementId: "G-6BLELTTMMC",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_")
);
