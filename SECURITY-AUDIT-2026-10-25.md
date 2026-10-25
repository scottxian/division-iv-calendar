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
