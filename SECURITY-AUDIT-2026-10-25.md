# Division IV — Phase 2 security audit (2026-10-25)

## Production and staging status

- Existing Inspector Desk remains live at `https://calendar.divisionivmasons.org/`.
- Public-site migration is still isolated to `phase-1-unified-site`. Domain DNS and GitHub Pages CNAME are unchanged.
- Existing Supabase staff, event, document and job data were not modified during the audit.
- A small live Inspector Desk frontend enhancement adds optional MFA enrollment and step-up verification.

## Changes deployed and verified

1. The calendar staff lookup now rejects staff records with a removal timestamp, even when another flag says they are enabled.
2. Calendar, lodges, site settings and resources Edge Functions allow both `https://divisionivmasons.org` and `https://www.divisionivmasons.org`, while retaining existing Wix and calendar origins until migration.
3. Administrators who enroll a verified authenticator factor must present an `aal2` session for administrator-only functions; unenrolled administrators can still work during the enrollment rollout. Existing inspector rights are unchanged. MFA factors and code verification belong exclusively to Supabase Auth.
4. Live Inspector Desk and the staging branch both include a self-service authenticator setup and code-verification panel. Authenticator secrets exist only within enrollment; no MFA secrets are checked into GitHub.
5. Calendar endpoint authorization errors now return HTTP 403 rather than 400.

### Production Edge Function versions after patch

| Function | Version |
| --- | --- |
| division-calendar | 32 |
| division-lodges | 6 |
| division-site-settings | 4 |
| division-resources | 4 |
| division-jobs | 19 (unchanged) |

All four changed functions reported `ACTIVE` on deployment.

## Live HTTP tests performed

Requests were made directly to Supabase using network-level requests with the new domain in the `Origin` header. No bearer credentials were used for anonymous tests.

| Test | Observed result | Expected |
| --- | --- | --- |
| Anonymous requests list and staff list | 403 | Denied |
| Anonymous resources list and download link | 403 | Denied |
| Anonymous lodge administration and private website settings | 403 | Denied |
| Anonymous staff-save, calendar review, resource upload/removal, lodge save and settings save POST | 400/403 before the final calendar error-status correction; all denied | Denied |
| Anonymous background job POST without internal runner secret | 401 | Denied |
| Fake JWTs sent to private resources and calendar | 403/400; denied | Denied |
| Hostile external Origin for four Edge Functions | 403 | Denied |
| Direct REST requests to staff_accounts and inspector_documents with publishable key | 401; permission denied | Denied |
| Supabase MFA factor list and enrollment without user JWT | 401 | Denied |
| Public calendar configuration | 200 | Available |
| Public lodge listing | 200 | Available |
| Public website settings | 200 | Available |
| Public calendar configuration using old origin | 200 | Available |
| Private storage bucket accessible as public download | No; bucket reported not public / 404 | Denied |
| Existing GitHub Pages homepage and new `/mfa.js` | 200 | Available |

After the final authorization-response correction, **anonymous calendar requests and staff list returned HTTP 403**, while the public calendar and lodge endpoints still returned HTTP 200. Their responses carried the expected `Access-Control-Allow-Origin: https://divisionivmasons.org` header.

## Database and code checks

- All 17 application tables in `public` have RLS enabled.
- Public tables have no direct `anon` or `authenticated` SELECT/INSERT/UPDATE grants.
- The `request_index` view uses `security_invoker=true` and is not publicly readable.
- Public RPC functions have no direct execution grants to `anon` or `authenticated`. Service-role Edge Functions are the intended database gateway.
- The `division-inspector-resources` storage bucket has `public=false`; objects are handled using short-lived signed URLs after staff authorization.
- The staff database has no enabled records flagged as removed.
- At audit time, zero MFA factors were verified and there were no active or pending inspector documents. The private-file download flow therefore cannot yet be verified using a real file.
- Staging files were screened for literal server-side secrets and private account tables. The browser contains a publishable Supabase key as intended, never a service-role key.

## Tests that still require a real login

1. **Administrator:** Sign in at the existing Inspector Desk, confirm the new account-security panel, enroll an authenticator and verify it. Then refresh/re-sign in, complete the code challenge, and access the staff, lodge, settings and resource-administration pages. Do not send authenticator codes or setup secrets to anyone.
2. **Inspector:** Sign in with an inspector account; verify event review and shared-document read access. Verify that staff administration, document upload/delete, website settings and lodge editing are not available, including when calling APIs directly.
3. **Disabled inspector:** Disable a dedicated test account and confirm its current valid session loses protected data access without waiting for JWT expiry. Re-enable only as planned.
4. **Documents:** An administrator uploads a harmless test PDF, an inspector downloads it, anonymous access to its storage path fails, nonadmins cannot upload/remove, and the administrator confirms version history on replacement.
5. **MFA enforcement:** After an administrator is enrolled, test an `aal1` session against all admin-only services (should be denied), then an `aal2` session (should be allowed). A code or user session must not be shared with the assistant.
6. **New-domain sign-in:** After GitHub Pages custom-domain deployment, add `https://divisionivmasons.org/inspectors/` and `https://divisionivmasons.org/events/` to Supabase Auth redirect allow-list, then test magic links. Browser deployment and Porkbun DNS are not switched yet.

## Advisor notes and remaining items

- Security advisor reports 17 `RLS Enabled No Policy` informational findings, consistent with deliberate service-role-only access. Do not grant all authenticated users table access to silence these notices.
- Security advisor reports *Leaked Password Protection Disabled*. The application uses email magic links, not passwords; review this if password-based accounts are later enabled. [Supabase guide](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Authenticated cross-role access, browser MFA interactions, and a real-file workflow have **not** passed end-to-end testing. Do not treat this audit as final security sign-off.


## Corrective finding and remediation — MFA authorization bypass

During real user testing, an enrolled administrator could still access and edit protected Inspector Desk content without completing the MFA challenge. This was a confirmed failure of the previous authorization design, not merely a visible-button problem.

**Root cause:** The first server-side check used `user.factors` from `auth.getUser(token)` as proof of enrollment. That property is not guaranteed to be present, and the check silently returned when absent.

**Remediation deployed to production:**
- `division-calendar` v36, `division-lodges` v8, `division-resources` v6, and `division-site-settings` v6 now call the service-role-only `auth.admin.mfa.listFactors({userId})` to fetch authoritative factor status, fail closed on lookup errors, and check the validated user's `aal2` token claim on every protected administrator operation.
- All administrators now require a verified MFA factor plus `aal2` for protected functions. Unenrolled administrators retain only the ability to sign in and complete MFA enrollment; inspector-only accounts continue their standard sign-in.
- The calendar `me` endpoint reports authenticated administrators' required/verified MFA state; the live frontend hides protected tabs until the server reports a verified session.
- Live site and staged migration use matching updated authorization UI. New domain and old calendar origin remain supported, and no DNS cutover took place.

**Regression verification:**
- Seven authorization unit scenarios passed (enrolled AAL1 denied, enrolled AAL2 permitted, unenrolled denied, unverified denied, auth lookup failure denied, malformed lookup denied, token-subject mismatch denied).
- The currently published GitHub Pages HTML, JavaScript, styles and MFA script all return HTTP 200 with current references.
- Public calendar config and lodge listing return HTTP 200; anonymous staff/document/website administration endpoints return HTTP 403.
- Supabase database confirms an active administrator account has a verified MFA factor.

**Still required before release:** Actual account-based end-to-end test: sign out, sign in using email link, verify administrator data and edits are denied before entering the authenticator code, complete MFA, then verify the same functions succeed. Automated mock tests and anonymous HTTP tests are not a substitute for this sign-in test.


## Universal inspector and administrator MFA policy — October 25, 2026

The policy now requires every active `inspector` **and** `admin` account to complete the email-link sign-in **and** authenticator verification (Supabase `aal2`) before accessing private Inspector Desk records or taking any protected action. New staff members who have not enrolled a factor can access the minimal staff identification and MFA enrollment screen only. Public event submissions, public Google Calendar, lodge directory, and website settings remain public.

Deployed Supabase services:
- `division-calendar` v37 — checks MFA on both staff roles for protected actions; the `me` action reports MFA status and returns only minimal staff identity until MFA succeeds. Public `config`, `locate`, and `submit` remain outside the staff-only MFA gate.
- `division-lodges` v9 — requires staff MFA before any private lodge-management operation; existing admin-only role checks remain.
- `division-resources` v7 — requires staff MFA before private document listing, download, and updates; existing admin-only upload/delete permissions remain.
- `division-site-settings` v7 — continues to require administrator role **and** verified MFA.
- `division-jobs` is unchanged and retains its independent internal authorization.

All four protected Edge Functions use the service-role-only `auth.admin.mfa.listFactors({userId})` and the validated session's `aal2` and matching user ID. Auth enrollment lookup failures deny access.

Both live `main` and migration `phase-1-unified-site` now display the same **Account security** setup/challenge panel to either active staff role and hide protected tabs until `me` reports verified MFA. Current staff records and private documents were not changed. No domain/DNS cutover was performed.

**Verification at deployment:**
- 9/9 server-side authorization scenarios passed in a dependency-isolated harness (AAL1 denial/AAL2 permission for both roles, unverified/no factor denied, tampered JWT subject denied, malformed/error factor lookup denied).
- 6/6 simulated browser MFA panels passed (enrollment, code challenge, and unlocked states for both admin and inspector).
- Live HTTP probes: public calendar config, public lodge listing, and public website configuration returned 200; unauthenticated private dashboard, staff administration, resources, lodge admin, and site settings returned 403.
- Unauthenticated POST requests for event review, staff changes, document upload, lodge changes, and site settings were all rejected (403).
- Empty public event submission returned ordinary input validation (400), showing that public submission was not blocked by staff MFA.
- GitHub Pages served the updated app.js v37 and mfa.js v8 (200).

**Outstanding real-user tests:** Sign out and back in with an inspector account. Verify protected information and actions remain inaccessible at `aal1`, enroll TOTP (if not already enrolled), verify the challenge, and confirm the Inspector Desk permits inspector-only tasks while still denying admin functions. Repeat with an administrator; confirm admin settings work only after MFA. Do not share sign-in links, QR codes, or TOTP values. Storage upload/download still requires a dedicated real-file test.

Email sign-in links necessarily precede MFA enrollment/challenge, because the email link establishes the initial user identity. Unauthorized Auth users may still be able to request a magic-link email through Supabase Auth; they receive no protected staff access without an enabled staff record and MFA. The current frontend keeps `create_user:true` to preserve first-time legitimate inspector onboarding. Restricting who can request magic links would require a separately designed, non-enumerating invitation/OTP workflow.


## Private resources — first real-document verification

The owner reported successfully uploading a document while signed in as administrator, then using a separate, MFA-verified inspector account and observing only **Download** and **History** actions, with no inspector upload, edit, or removal controls.

Database verification on October 25, 2026:
- Exactly 1 non-deleted document metadata record in `public.inspector_documents`.
- Exactly 1 storage object in private bucket `division-inspector-resources`; bucket `public=false`.
- A direct anonymous request for the real object's public URL returned a bucket-not-found error (no public exposure).
- A direct private-object request without authorization was denied (required authorization header missing).

Status: **Role-specific resource UI and storage privacy verified**. The inspector has not yet explicitly confirmed actually clicking Download and opening the retrieved file; authenticated signed-download URL fulfillment is therefore not marked passed. Separate administrator upload success is confirmed by the new database record and storage object.
