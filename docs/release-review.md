# Winter Arc release review

Reviewed source: `9bbd5e6ccf340f247c85f0672ac1d10bde66318e`, October 11, 2026 Eastern.
Verdict: **hold release**. This is source review; runtime and native device checks are still required.

## 1. [P1] Failed or unfinished backup lookup can overwrite the cloud copy

Locations: [src/app/mfa.tsx:40](../src/app/mfa.tsx#L40), [src/app/setup.tsx:35](../src/app/setup.tsx#L35), [src/app/setup.tsx:78](../src/app/setup.tsx#L78).

MFA reconciliation turns any latestBackup error into null, then schedules an immediate upload. If an existing backup lookup fails transiently and the upload succeeds, local data replaces the sole cloud snapshot without the copy-selection prompt. Setup also swallows lookup failures and permits starting an automatically backed-up Arc before the lookup settles.

Reproduce with an existing cloud backup, a different local Arc, and a failed metadata request followed by a working upload. Also test Start Day 1 while metadata is delayed after erasing local data.

Fix: distinguish pending, failed, present and confirmed-absent metadata; pause uploads before reconciliation and preserve both copies until a successful lookup and explicit conflict choice.

## 2. [P1] Pending upload undoes the pause after deleting a cloud backup

Locations: [src/sync/backup.ts:77](../src/sync/backup.ts#L77), [src/sync/backup.ts:119](../src/sync/backup.ts#L119), [src/sync/backup.ts:158](../src/sync/backup.ts#L158).

Delete pauses automatic backups before awaiting the existing upload chain. Every successful backupNow call clears that pause, including automatic uploads. If an upload completes during deletion, deletion finishes with automatic backups internally enabled, while Settings says they remain off. A subsequent edit recreates the deleted backup.

Fix: separate explicit manual-backup resume behavior from automatic uploads and preserve the delete/reconciliation pause while queued work drains.

## 3. [P2] Delayed journal responses can expose a previous account's data

Locations: [src/state/journalStore.ts:120](../src/state/journalStore.ts#L120), [src/state/journalStore.ts:183](../src/state/journalStore.ts#L183), [src/state/journalStore.ts:205](../src/state/journalStore.ts#L205).

Snapshot fetches check session generation, but mutation completions and note/log subscription callbacks do not. Delay account A's new-note or add-log response, sign out and sign into account B, then let A's response complete: its row is inserted into the current visible list.

Fix: capture the authentication generation for writes and subscriptions and guard both immediate and queued state changes, including error callbacks. This is a client-state issue; the inspected server RLS owner/AAL2 checks do not prevent stale client responses.

## 4. [P2] Cold launch exposes content before the app lock is initialized

Locations: [src/app/_layout.tsx:19](../src/app/_layout.tsx#L19), [src/app/_layout.tsx:47](../src/app/_layout.tsx#L47), [src/state/lockStore.ts:47](../src/state/lockStore.ts#L47).

Arc loading completes synchronously. Lock settings are read asynchronously while the store defaults to unlocked. Rendering is gated only on Arc loading, so private content can appear before a persisted lock engages. This contradicts phone checklist 1.4.

Fix: gate protected content on completed lock initialization and handle storage/authentication errors without exposing the screen.

## 5. [P2] Today confirmation buttons can change progress while locked

Locations: [src/app/(tabs)/today.tsx:152](../src/app/%28tabs%29/today.tsx#L152), [line 191](../src/app/%28tabs%29/today.tsx#L191), [line 230](../src/app/%28tabs%29/today.tsx#L230).

Unlike the Settings and setup confirmations, make-up, Skip and Start new Arc handlers do not use unlessLocked. The repository documents that iOS alerts float above the lock overlay. Leave a confirmation open, background/reopen, cancel unlocking, then tap the alert's confirmation: it still mutates progress.

Fix: guard these alert callbacks, and verify on iOS with the lock enabled.

## 6. [P2] Concurrent accounts can exceed the global AI usage cap

Location: [supabase/migrations/0002_ai_quota.sql:42](../supabase/migrations/0002_ai_quota.sql#L42).

The function checks a global sum before inserting independent per-user counters. With 59 calls counted, simultaneous requests for different users can each pass the 60-call test. Their row locks do not serialize the global claim.

Fix: use a shared quota row or transaction-level advisory lock around the aggregate check and claim; verify with concurrent users.

## 7. [P2] Final grace-period make-up does not restore the promised point

Locations: [src/state/arcStore.ts:80](../src/state/arcStore.ts#L80), [src/engine/scoring.ts:92](../src/engine/scoring.ts#L92).

On day 101 before noon, the Arc remains open and Today offers make-up work. The store records that recovery on day 101, while scoring processes only days 1–100. The displayed "I did it (+1)" therefore does not refund a point.

Fix: explicitly support recovery during that final grace period or remove the offer when it cannot count; add a boundary test.

## Release evidence still needed

- Lint and typecheck (required by AGENTS.md).
- Jest tests and Expo web/iOS/Android bundle export.
- Native development-build compile/install and actual phone checklist.
- Live Supabase auth, MFA, migrations/functions, RLS and multi-device sync tests.
- Reconciliation tests with delayed/failed requests and account switches.

Passing build checks does not resolve the source findings above or replace live/native verification.
