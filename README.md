# Lazy Task Management Tool

A minimalist recurring-task tracker. Add tasks with a label, description, and
cadence (e.g. "2 / week"), then mark them complete as you go. Everything is
stored in the browser's `localStorage` — no backend, no build step.

## Features

- Add, edit, and remove recurring tasks, plus one-time tasks with a fixed due date
- Cadence expressed as `N times per day/week`
- Tasks are sorted by which is due soonest, with status filters (overdue / due
  soon / on track) and a "This Week" calendar view
- Marking a task complete records:
  - total number of completions
  - number of completions that were "on time" (within a 6-hour leniency
    window of the task's due time)
  - how early/late completions tend to be, on average
- A Metrics view visualizes overall task health (on-time rate, per-task
  breakdown) and a History log tracks completed one-time tasks
- Export/import all data as a JSON file from the Settings menu
- Data persists locally in your browser between visits
- Optional: sign in with Google to sync your data across devices (see below)

## Running locally

This is a static site — just open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

Enable Pages for this repo under **Settings → Pages**, with the source set
to the `main` branch (root directory).

## Cloud Sync Setup (optional)

By default the app works entirely offline, storing data only in
`localStorage`. If you want your tasks to follow you across devices, you can
wire it up to your own free Firebase project. This is a one-time setup done
in the Firebase console — no server code, no build step, and it costs
nothing at this scale (Firebase's free "Spark" plan covers it).

**Why this is safe to commit:** the config values below identify which
Firebase project the app talks to — they are not secrets. Real access
control comes from the Firestore Security Rules and the Google sign-in flow
itself (both set up below), not from hiding these values.

1. Go to the [Firebase console](https://console.firebase.google.com/) and
   create a new project (free).
2. In **Build → Authentication → Sign-in method**, enable the **Google**
   provider.
3. In **Build → Firestore Database**, create a database (production mode is
   fine).
4. In Firestore, go to the **Rules** tab and replace the rules with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
   This ensures each signed-in user can only ever read or write their own
   data.
5. In **Project settings → General → Your apps**, add a Web app and copy the
   `firebaseConfig` object it gives you.
6. Paste those values into `js/firebase-config.js` in this repo, replacing the
   placeholders.
7. In **Authentication → Settings → Authorized domains**, add the domain
   you're deploying to (e.g. `yourname.github.io`) — `localhost` is already
   included by default for local testing.

Once configured, a "Sign in with Google" option appears under the ⚙
Settings menu. On first sign-in, if cloud data already exists for that
account, you'll be asked whether to keep the cloud data or this device's
data. After that, changes sync automatically in the background.
