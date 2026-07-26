# Lazy Task Management Tool

A minimalist recurring-task tracker. Add tasks with a label, description, and
cadence (e.g. "2 / week"), then mark them complete as you go. Everything is
stored in the browser's `localStorage` — no backend, no build step.

## Features

- Add, edit, and remove tasks
- Cadence expressed as `N times per day/week`
- Tasks are sorted by which is due soonest
- Marking a task complete records:
  - total number of completions
  - number of completions that were "on time" (within a 6-hour leniency
    window of the task's due time)
- Data persists locally in your browser between visits

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
