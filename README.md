# Vellum — Deployment Guide

## What's in this folder
- `index.html` — the full app (single page, no build step needed)
- `netlify/functions/claude.js` — holds your API key safely, talks to Claude on the app's behalf
- `netlify/functions/storage.js` — saves your study data (personal + shared Study Room)
- `netlify.toml` — tells Netlify how to run everything together
- `package.json` — one small dependency the storage function needs

## Step-by-step deployment

### 1. Your Gemini API key
You already have this — from https://aistudio.google.com/app/apikey. Keep it somewhere private; you'll paste it into Netlify (not into any file) in step 3.

### 2. Push this code to GitHub
1. Create a new repository on github.com (call it `vellum` or similar)
2. Upload all the files in this folder to that repository (drag-and-drop works fine on github.com, or use GitHub Desktop if you prefer)
3. Double-check your API key is NOT visible anywhere in the uploaded files — it should only ever go into Netlify's environment variables, never into code that's pushed to a public repo

### 3. Deploy on Netlify
1. Go to https://app.netlify.com and log in with GitHub
2. Click **Add new site → Import an existing project**
3. Choose your `vellum` repository
4. Leave the build settings as-is (this project needs no build step) and click **Deploy**
5. Once it deploys, go to **Site configuration → Environment variables**
6. Add a new variable: key = `GEMINI_API_KEY`, value = your Gemini key
7. Go to **Deploys** and click **Trigger deploy → Deploy site** once more, so it picks up the new key

### 4. Test it for real
- Open the live Netlify link in a private/incognito browser window (this proves it works with no login, no account, nothing)
- Try generating a plan, taking a quiz, and posting in the Study Room from two different browsers to confirm the shared room actually works

### 5. Give judges the link
Once step 4 works cleanly, that Netlify URL is what goes in your submission — anyone can click it and use the real thing immediately.

## If something doesn't work
- **"Server is missing GEMINI_API_KEY"** — you skipped step 3.6, or forgot to redeploy after adding it
- **AI calls fail with an error** — double check the key was copied correctly, with no extra spaces
- **Study Room doesn't show messages from another browser** — double-check both are using the exact same goal title (it's used to build the shared room key)
