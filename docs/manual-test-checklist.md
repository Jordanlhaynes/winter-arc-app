# Manual iPhone test checklist

Run on a development build (EAS `development` profile or `npx expo run:ios`), not Expo Go. Face ID and
SQLite encryption need native modules that Expo Go does not ship. Use a real iPhone with Face ID / Touch ID
and a passcode set, plus an authenticator app (Google Authenticator, Microsoft Authenticator or iPhone Passwords).

Tick each line only after you saw the stated result. If a step fails, note the phone, OS version and the exact
step number.

## 0. Preconditions

- [ ] Phone has a passcode / screen lock and at least one biometric enrolled.
- [ ] `.env.local` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the live project.
- [ ] Supabase Auth has sign-ups allowed (phone sign-up) and MFA (TOTP) enabled.
- [ ] You have two phones, or one phone plus the ability to erase and reinstall, for the restore tests.

## 1. App lock

Turn the lock on first: Settings > Privacy > App lock.

| # | Steps | Expected |
|---|-------|----------|
| 1.1 | Toggle App lock on. | Biometric or passcode prompt "Turn on app lock". After success the switch stays on. Cancel the prompt: switch snaps back to off, no alert. |
| 1.2 | Press home. Reopen the app. | Lock screen shows (icon, "Winter Arc is locked", Unlock). Biometric prompt appears on its own once. After success the app is where you left it. |
| 1.3 | Repeat 1.2 but cancel the biometric prompt. | Lock screen stays. No second prompt appears by itself. Tap Unlock: prompt again. Success unlocks. |
| 1.4 | Kill the app from the app switcher. Cold start. | Lock screen first, prompt appears once. No flash of Today / notes content before the lock screen. |
| 1.5 | Open Settings > Sign in (account sheet). With the sheet open press home, then return. | Lock screen covers the sheet. After unlocking, the sheet is still open with the email you typed. |
| 1.6 | On the 2-factor sheet tap "Open authenticator app", read a code, switch back. | Lock screen, prompt, unlock. The 2-factor sheet is still open with the setup key and code field. Enter the code: verifies. |
| 1.7 | Open the Erase alert in Settings, press home, return and cancel the biometric prompt so the app stays locked. Tap Erase in the alert (it floats above the lock on iOS). | Nothing is erased. Unlock, check Today still has your data. |
| 1.8 | Type in a note, press home, return. | Keyboard is down under the lock screen. Nothing typed while locked reaches the note. |
| 1.9 | Lock on. In system settings remove the passcode (and so biometrics). Reopen the app. | No lock screen, no prompt. Settings shows App lock off. Re-add the passcode later. |
| 1.10 | Toggle App lock off. | Prompt "Turn off app lock". Success: switch off, backgrounding no longer locks. Cancel: switch stays on. |
| 1.11 | iOS only: lock on, background the app, open the app switcher without reopening. | Known trade-off: the switcher snapshot may show the last screen. The lock engages on background, not on the switcher. |
| 1.12 | Deep link while locked (iOS): lock the app, open `winterarc://account` from Notes. | Lock screen or lock-styled sheet; no sign-in form usable before unlocking. |

## 2. Account and 2-factor

| # | Steps | Expected |
|---|-------|----------|
| 2.1 | Settings > Sign in or create account > New here? Create an account. Enter email and a password of 8+ chars. | "Check your email" alert if confirmation is on, else straight to the 2-factor sheet. Password under 8 chars: inline error, no network call. |
| 2.2 | Confirm the email, come back, sign in. | Lands on "Set up 2-factor". |
| 2.3 | Tap Start setup. | Setup key and "Open authenticator app" shown. Tapping the button opens the authenticator or shows "No app opened". Long-press copies the key. |
| 2.4 | Enter a wrong 6-digit code. | Inline error, sheet stays. |
| 2.5 | Enter the right code. | First phone, no backup yet: sheet closes, Settings shows the email and "No backup yet" then a backup time within ~10 s. |
| 2.6 | Sign out from Settings. Sign in again. | Lands on "Enter your code". Correct code returns to Settings with backup status. |
| 2.7 | Kill the app and cold start while signed in. | Settings shows "ready" state (email + last backup) without asking for the code again, as long as the session is valid. |
| 2.8 | Settings > Sign out while a backup is pending (edit a task, sign out within 5 s). | No crash. Later edits do not upload. Sign in again: a backup follows the next change. |

## 3. Backup, restore, erase

| # | Steps | Expected |
|---|-------|----------|
| 3.1 | Signed in and ready. Complete a task on Today. Wait ~5 s. | Settings "Last backup" time moves forward. |
| 3.2 | Settings > Back up now. | Time updates. Supabase `backups` row `updated_at` matches. |
| 3.3 | Settings > Restore from backup > Cancel. | Nothing changes. |
| 3.4 | Change a goal locally, then Restore > Restore. | Local data replaced by the backup. Today reflects the backup. No new upload follows (Last backup unchanged). |
| 3.5 | Settings > Delete cloud backup > Delete. | "No backup yet". Text says automatic backup is off until Back up now. Edit a task: Last backup stays empty. |
| 3.6 | After 3.5 tap Back up now. | Backup time appears. Automatic backups resume (edit a task, time moves). |
| 3.7 | Settings > Erase this phone's data > Erase (signed in). | Lands on the setup screen with a "You have a cloud backup from …" card. Supabase row still exists. |
| 3.8 | On setup after 3.7 tap Restore it. | Today shows the restored Arc. |
| 3.9 | On setup after 3.7 fill goals and tap Start Day 1. | Alert "Start a new Arc?" with Restore backup instead / Start new Arc. Start new Arc: fresh Arc, backup replaced within ~10 s. |
| 3.10 | Second phone (or reinstall), sign in, pass 2-factor, with no local data. | "Welcome back" alert, Arc restored, lands on Today. |
| 3.11 | Second phone with its own local Arc, sign in, pass 2-factor. | "Which copy should we keep?" alert. Keep this phone: cloud replaced by this phone. Restore cloud backup: local replaced. Settings shows automatic backup paused until a choice was made. |
| 3.12 | Erase while signed out. | Alert text says it permanently deletes. Lands on setup with no restore card. |
| 3.13 | Airplane mode, edit a task, Back up now. | "Something went wrong" alert with a network message. Leave airplane mode, edit a task: next automatic backup lands. |

## 4. After each test run

- [ ] Note the app version (`app.json` version) and the EAS build id.
- [ ] Record failures with phone model, OS version, step number, what you saw.
- [ ] Check Supabase logs for the `backups` table and auth events if a step touching the cloud failed.
