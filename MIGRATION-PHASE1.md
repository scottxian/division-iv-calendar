# Division IV unified website — Phase 1 staging

This branch is NOT live. The published `main` branch, its existing calendar custom domain, Wix, Supabase, and DNS remain unchanged.

## Intended routes

- `/` — public homepage
- `/calendar/` — public Google Calendar
- `/lodges/` — public lodge directory
- `/events/` — event submissions/changes/cancellations
- `/inspectors/` — inspector sign-in and role-controlled administration

Both events and inspectors use the existing application code in `/app/` to avoid duplicating business logic. Supabase still enforces roles and stores all private data and documents; none are copied into GitHub.

## Required before cutover (Phase 2/3)

- Verify all Supabase functions, database RLS, storage policies, authorized roles and disabled-account handling; update allowed CORS origins for `https://divisionivmasons.org`.
- Add `https://divisionivmasons.org/events/` and `https://divisionivmasons.org/inspectors/` to Supabase Auth redirect allowlist.
- Test all browser routes and login flows under the new origin, including documents, submissions, admin functions and mobile layout.
- Update Supabase website settings and email links only when the new deployment is verified.
- During domain cutover, update the GitHub Pages custom domain `CNAME` and Porkbun apex/www DNS. Do not change the current `calendar` subdomain in advance.

The `CNAME` file intentionally still contains the live **old** calendar domain until Phase 3.
