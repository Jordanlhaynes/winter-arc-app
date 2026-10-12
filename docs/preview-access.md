# Winter Arc — preview access and release review

Review date: October 11, 2026 (America/New_York).
Source reviewed: `9bbd5e6ccf340f247c85f0672ac1d10bde66318e` on `main-wiua0b`.
The app source matches `main`; the second branch adds the manual phone test checklist.

**Release verdict: hold.** Source review found backup data-loss and account/privacy issues. Automated validation is being set up; successful bundling alone would not clear these findings.

## Logins

- Winter Arc account email: not confirmed. No app account email or password was found in the reviewed source.
- Password: not retrieved or created. Use the password chosen when the Winter Arc account was registered.
- Two-factor: the cloud features require a six-digit code from the enrolled authenticator app.
- Web: sign-in only; account creation and authenticator enrollment are offered in the phone app, subject to Supabase settings.
- Mobile: basic Arc tracking works offline without an account; cloud backup, notes, log and AI need the configured backend.
- GitHub, Supabase and Expo management accounts are separate from the Winter Arc app login.

If Claude created a test account or preview, retrieve its details from the linked Claude session below. Do not put passwords, API secrets or authenticator setup keys in this public repository.

## URLs

| Item | URL / verified status |
| --- | --- |
| GitHub repository | https://github.com/Jordanlhaynes/winter-arc-app |
| Source reviewed | https://github.com/Jordanlhaynes/winter-arc-app/tree/9bbd5e6ccf340f247c85f0672ac1d10bde66318e |
| Claude coding session from signed commit metadata | https://claude.ai/code/session_01UZfL6hKrnFUWbwkeJFNbtU |
| Web preview | No working hosted URL verified. No matching Winter Arc project found in the connected Vercel personal/team projects. |
| Local web configuration | http://localhost:8082 — configured in .claude/launch.json, but no running server was verified. |
| Mobile preview / install link | No working link or build verified. EAS project ID in app.json: 44f1cb8d-a0ca-4790-a038-d576c242b7a8. |
| Expo dashboard | https://expo.dev — sign in to the account owning the project ID above; use its Builds page for an install link. |
| Supabase project console | https://supabase.com/dashboard/project/vmgchxqdfomvtuvlnfgr — project reference from .mcp.json; authenticated access not yet verified. |
| Automated checks | https://github.com/Jordanlhaynes/winter-arc-app/actions |

The Expo dashboard and Supabase console are management links, not app previews.

## What remains before usable previews

1. Confirm access to Supabase project `vmgchxqdfomvtuvlnfgr`. Check deployed migrations, row policies, functions, MFA settings, app account status and allowed password-reset redirect URLs.
2. Supply the app build's public Supabase URL and publishable/anon key through the deployment environment. The committed .env.example has placeholders only; this does not prove Claude's local environment is missing.
3. Fix the release findings in release-review.md and run the repository checks.
4. For web, export the web companion and deploy a preview, then verify sign-in, TOTP, notes/log sync and password reset in a browser.
5. For mobile, configure an EAS development/preview build and obtain its install link. A browser at phone width does not test native SQLite, biometric lock or background behavior. Face ID needs a native development build.
6. Complete docs/manual-test-checklist.md on an actual supported phone, using test data for backup/restore/erase checks.

## Validation limits

Local command and browser tools failed to start during this review. No local lint, typecheck, tests, web server or native preview were run. GitHub checks will report their actual results separately. No production app release is authorized by this report.
