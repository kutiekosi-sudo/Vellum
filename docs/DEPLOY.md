# Deploy and pilot checklist

Do these in order. Tick each one before the next.

## 1. Before the deploy
- [ ] Netlify production deploys are available again (credits reset on Nov 16, or the plan is upgraded).
- [ ] In Firebase, Usage and billing: the project is on the Blaze (pay as you go) plan. The `default` database is a named database, so it has no free quota and needs billing on. Set a budget alert (it warns, it does not stop spending).
- [ ] On GitHub, merge the `learnr-platform` branch into `main`.

## 2. Publish the access rules (Firebase console, Firestore, Rules)
- [ ] Copy all of `firestore.rules` from the branch into the Rules editor and press Publish.
- [ ] This is needed for: pods (name check, messages, notes, countdown), the calendar, scheme of work, concept cards and shared flashcards/quizzes. Until it is done, those features show "permission denied".

## 3. Deploy
- [ ] Netlify, Deploys, make sure the latest `main` is published.
- [ ] Firebase, Authentication, Settings, Authorized domains: `learnr-study.netlify.app` is listed.
- [ ] Open the site on a phone. Hard refresh once (the new offline version takes over on the second open).

## 4. Check it works (five minutes)
- [ ] Sign in with Google as a student. The Learnr logo animation shows on the sign-in page.
- [ ] Start a focus timer, finish or stop it. It appears in Statistics.
- [ ] Study, Flashcards: make a deck from notes (this tests the AI). If it says the AI is busy, try again in a minute.
- [ ] Share the deck with a code, add it from a second account.
- [ ] Make a pod, join it from a second account using the name and code.
- [ ] Sign in as a teacher: create a class, join it as a student, post an announcement, check the bell and Analytics.
- [ ] Install the app from Profile. Switch on airplane mode and reopen it.

## 5. Pilot with one class
- [ ] One teacher and one class (20 to 40 students). Ask them to find things without help.
- [ ] Watch Firebase Usage (reads, writes) for a week.
- [ ] Write down every confusing screen and fix those first.

## If something fails
- "Missing or insufficient permissions": the rules were not published, or an old copy is live. Publish again.
- Sign-in window closes: the site address is missing from Authorized domains.
- AI says busy: Google's model is overloaded. The app retries and falls back to a second model; try again shortly.
- A phone shows the old version: close the app fully and reopen it twice.
