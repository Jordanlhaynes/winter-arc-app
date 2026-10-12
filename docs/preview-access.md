# Winter Arc — logins and preview URLs

Updated October 11, 2026, Eastern.

## Logins

- App: use your existing confirmed Winter Arc account, password, and six-digit authenticator code. The account and verified authenticator are confirmed in Supabase.
- Your password was not retrieved or changed. It cannot be recovered from the stored password hash.
- Vercel protection: sign in to the Vercel account with access to the Project Clay / transformation-labs project before opening the preview.
- GitHub, Supabase and Expo management logins are separate from the app login. No passwords, private API keys or authenticator setup secrets are stored in this public file.

## URLs

| Item | Link / status |
| --- | --- |
| Web preview — also opens in your iPhone browser | https://transformation-labs-qw2fjaxkz-project-clay.vercel.app |
| Preview sign-in screen | https://transformation-labs-qw2fjaxkz-project-clay.vercel.app/account |
| Preview Notes | https://transformation-labs-qw2fjaxkz-project-clay.vercel.app/notes |
| Native iPhone install link | Not generated yet. Requires an Expo/EAS build with Apple signing and a registered device. |
| GitHub review and fixes | https://github.com/Jordanlhaynes/winter-arc-app/pull/1 |
| Automated validation | https://github.com/Jordanlhaynes/winter-arc-app/actions/runs/38197436916 |
| Supabase management console | https://supabase.com/dashboard/project/vmgchxqdfomvtuvlnfgr |
| Earlier Claude coding session | https://claude.ai/code/session_01UZfL6hKrnFUWbwkeJFNbtU |

The web companion contains Notes and Log. Full Arc tracking, local SQLite storage and Face ID are in the installed iPhone app. The same web preview link works on computer and mobile browsers.

## Current status

The Vercel preview deployment is READY at app commit `5199d725a11d3167b1bd78913014057985e437b9`. Interactive verification from this connection is blocked by Vercel's protected-deployment access permissions; open it while signed into your authorized Vercel account.

- Fixes are pushed to the review branch; Android-specific support is removed.
- Typecheck, lint, 41 tests, and web/iOS exports passed.
- Supabase note timestamp, AI quota serialization and failed-request refund fixes are applied. Owner/MFA policy tests passed with all temporary rows rolled back.
- Your existing cloud backup remains unchanged.
- Production release is held for interactive web sign-in/sync checks, a signed iPhone build and real-device testing.

## Deployment setup

The repository includes `vercel.json` for the web companion and `eas.json` with an internal iPhone `preview` build profile. The web preview uses the existing Supabase project through preview-only Vercel environment variables.

For a future iPhone build, use the existing EAS project `44f1cb8d-a0ca-4790-a038-d576c242b7a8`, configure its public Supabase URL/key in the EAS build environment, and complete the Apple signing/device setup. Then run `npx eas-cli@latest build --platform ios --profile preview` from the project with authenticated EAS CLI access.

A password-reset link may require the preview origin to be added to Supabase Auth's allowed redirect URLs. No password reset email has been sent during this work.
