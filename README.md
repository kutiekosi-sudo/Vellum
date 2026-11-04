# Learnr: Learn. Practice. Improve.

A web app for classrooms and self-study. Teachers run classes, assignments, CBTs, a calendar, a scheme of work, a lesson planner and class analytics. Students get a focus timer, statistics, practice quizzes, flashcards, an AI coach, and Study Pods to study with friends. Students without a school get every study feature.

Live site: https://learnr-study.netlify.app/

## How it is built

- **Front end:** React 19, bundled by `build.mjs` (esbuild). The built site is committed in `dist/`, so Netlify only has to serve it.
- **Data and sign-in:** Firebase (Google sign-in and Firestore). Project `learnr-e939d`, database id `default`. Access rules are in `firestore.rules`.
- **Server work:** Netlify Functions in `netlify/functions` (`ai.mjs` for the AI features, `cbt.mjs` for tests so answer keys never reach students, `files.mjs`).
- **Works offline:** `public/sw.js` keeps the app on the device. Study data is kept by Firestore's on-device cache and syncs when the connection returns.

## Commands

```
node build.mjs            # production build into dist/ (commit the result)
node build.mjs --test     # offline test build in .test-tmp/dist using an in-memory fake backend
```

The test build swaps `src/backend/real.js` for `src/backend/fake.js`, which mirrors the Firestore rules, so every screen can be tried without the internet. The rules in `firestore.rules` and the checks in `fake.js` must be kept in step.

## Settings the server needs (Netlify, Site configuration, Environment variables)

| Name | What it is |
| --- | --- |
| `GEMINI_API_KEY` | Key for the AI features |
| `FIREBASE_PROJECT_ID` | `learnr-e939d` |
| `FIRESTORE_DATABASE_ID` | `default` |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Optional. The AI model, and the one to try if it is busy |

Never commit keys. The Gemini key lives only in Netlify.

## Deploying and piloting

See [docs/DEPLOY.md](docs/DEPLOY.md).

## What is kept private

Study sessions, flashcards, practice sets, topics, goals, calendar, scheme of work and concept cards live under each person's own `users/{uid}` and only that person can read them. Teachers never see a student's private study data. A flashcard deck or practice set is shared only when its owner makes a share code. Pods need both the pod name and its code.
