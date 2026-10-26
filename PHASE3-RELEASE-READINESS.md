# Division IV unified website — Phase 3 pre-cutover verification

Date: October 26, 2026  
Branch: `phase-1-unified-site`  
Current live site: `https://calendar.divisionivmasons.org/` (Inspector Desk)  
Current public Wix site: `https://headless-odfdmxtmddz-scottyjchristian-1410.wix-site-host.com/`

## Identity and content

Official Grand Lodge of California / Masons of California website: https://freemason.org/  
Grand Lodge organizational background: https://freemason.org/about-us/  
The official site explicitly references Division IV in its events, e.g. https://freemason.org/events/morning-star-no-19-reception-for-the-agl-of-division-iv/.

All five new website routes clearly link Division IV to the Grand Lodge of California:
- `/` — persistent affiliation ribbon, updated hero, About section and footer
- `/calendar/`, `/lodges/` — ribbon and footer
- `/events/`, `/inspectors/` — affiliation banner and footer

Page titles and search descriptions now identify the Grand Lodge. No Grand Lodge-owned logo or assets were copied without permission; the site retains the existing Division IV identity. Outdated public-chat and "initial draft" wording were removed.

## Automated tests completed — PASS

- **23/23 extended Playwright browser checks** passed in GitHub Actions run https://github.com/scottxian/division-iv-calendar/actions/runs/40411789780.
- Desktop routes and mobile routes: `/`, `/calendar/`, `/lodges/`, `/events/`, `/inspectors/`.
- Verified Grand Lodge affiliation links in body/footer on every route, no horizontal page overflow at tested desktop/mobile widths.
- Public links: event-request CTA, Google Calendar embed, mobile menu, lodge directory search + reset, and event request new/change/cancel modes with required-input constraints.
- Simulated inspector AAL1 blocked, inspector AAL2 allowed (administrator tab hidden).
- Simulated administrator AAL1 blocked, administrator AAL2 allowed (administrator tab displayed).
- Simulated disabled staff unable to open the Inspector Desk.
- **Static smoke suite**: all seven HTML files, required routes, local references, JavaScript syntax, CNAME guard, secret-marker scan.
- Screenshot evidence (14 files) available from the GitHub Actions run. Browser tests used simulated login sessions, not real user credentials and made no live calendar edits.
- Previously repaired eight malformed event-request links. Homepage event shortcut now points to `/events/` rather than the inspector login.

## Backend checks — PASS

- Read-only HTTP tests with `Origin: https://divisionivmasons.org`: public calendar config, public lodges, public website settings returned **200**.
- Private calendar dashboard, inspector list, private document list, lodge management and website administration returned **403** for anonymous requests.
- All **17 of 17** public application tables have RLS enabled; no `anon`/`authenticated` direct grants to application tables.
- Inspector resource bucket remains **private** (`public=false`).
- Current public lodge directory matches the **29** active lodge records in the database.
- Earlier live-domain human tests: MFA sign-in, inspector-only Resources download, absence of administrator controls, and disabled inspector access-denial all passed on `calendar.divisionivmasons.org`.
- Existing current calendar site and Wix public URL remained responding during preparation.

## Not yet possible before cutover — must be validated before final launch sign-off

1. **Actual apex/www HTTPS:** Requests to `https://divisionivmasons.org/` and `https://www.divisionivmasons.org/` did not complete an SSL handshake during the pre-cutover check. DNS and GitHub Pages custom-domain configuration have intentionally not been changed.
2. **Supabase Auth redirect allowlist:** Before requesting magic links from the new domain, add exact production routes to Supabase Dashboard > Authentication > URL Configuration > Redirect URLs:
   - `https://divisionivmasons.org/inspectors/`
   - `https://divisionivmasons.org/events/` (if staff sign in here)
   - equivalent `www` routes only if `www` is intended as a landing domain
   - retain the existing `https://calendar.divisionivmasons.org/` redirect during transition
3. **New-origin real user authentication:** Verify live magic-link redirect, TOTP enrollment/challenge, AAL1 denial, AAL2 access, inspector/admin separation, and Resources download **on the new apex domain**.
4. **New-origin real event submission:** Use an approved test event (or non-production test environment) to verify the full review/approval/publishing flow. The staging browser tests intentionally did not write to production.
5. **DNS / GitHub Pages / TLS:** Verify custom-domain ownership, GitHub Pages CNAME, Porkbun `@` A or ALIAS/ANAME records and `www` alias, HTTPS issuance and renewal. Follow https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site; don't infer existing Porkbun DNS from repo code.
6. **Public website settings:** After apex-domain verification, update persisted Supabase `website_site_url`, event request, Inspector Desk and calendar fallback URLs away from the old Wix/calendar settings. These were intentionally not changed for staging.
7. **Old calendar URL continuity:** A single GitHub Pages repository normally publishes one custom domain. Before switching its CNAME to the apex, decide how `calendar.divisionivmasons.org` should redirect or remain hosted to avoid breaking existing email links/bookmarks. Existing live branch is backed up at `backup-live-calendar-before-unified-site`.
8. **Manual visual review:** Automated screenshots and overflow assertions passed at 1440px and 390px; a final human visual check should confirm branding, official links and cross-browser appearance.

## Production safety

- No Porkbun DNS, GitHub Pages live `main` branch, live CNAME, Wix site, Supabase event data, or private documents were modified by this staging/branding work.
- Do not merge staging or change DNS until HTTPS and redirects have a verified cutover plan.
- Earlier security audit: `SECURITY-AUDIT-2026-10-25.md`.

**Decision: PRE-CUTOVER TESTS PASSED; LIVE DOMAIN CUTOVER NOT YET APPROVED / VERIFIED.**
