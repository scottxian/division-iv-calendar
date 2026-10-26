# Phase 3 — Division IV unified website cutover checklist

**Prepared:** October 25, 2026 (Pacific)  
**Status:** Staging passed automated checks; **DO NOT CUT OVER** before completing the remaining external configuration and authenticated domain checks.  
**Production:** `main` published at `https://calendar.divisionivmasons.org/`; current Wix public site remains live.  
**Staging:** `phase-1-unified-site`, never merged to production.  
**Rollback:** `backup-live-calendar-before-unified-site` captures production before Phase 3.  
**Primary domain:** `divisionivmasons.org`.

## Verified before cutover

- Eight malformed Submit Event links fixed on staging (five home, two calendar, one lodges).
- Staging static checks cover seven HTML files, eight browser JavaScript files, local asset resolution, ids, navigation and browser secret markers.
- GitHub Actions `Unified site staging checks`: successful. Chromium opened homepage, calendar, lodge directory, public event request form, Inspector Desk sign-in route, and mobile homepage; mobile menu opened. Screenshots attached to run.
- The current public Wix website and calendar site both returned HTTPS 200 in live probes.
- The apex and www domains did not yet complete a valid HTTPS connection at the time of testing: **not ready for visitors**.
- The database, application permissions, MFA flow, private documents, and disabled-inspector behavior were tested previously and remain live on the old calendar hostname.
- **No Porkbun DNS, main/CNAME, Wix public site, calendar ownership or server-side site settings changed during Phase 3 preparation.**

## Pre-cutover tasks

1. **Supabase Auth Redirect URLs.** In [Supabase Dashboard](https://supabase.com/dashboard/project/lxvceqshpjnjjlllbpaq/auth/url-configuration), add each exact callback path:
   - `https://divisionivmasons.org/events/`
   - `https://divisionivmasons.org/inspectors/`
   - Optionally their `www` versions if users may browse `www` before canonical redirect.
   Retain all existing `calendar.divisionivmasons.org` redirect URLs until old links have been retired. Do not change Supabase project keys or service-role grants. After launch, set Site URL to `https://divisionivmasons.org/` if appropriate for default email redirects.
2. **Cloudflare Turnstile.** Add `divisionivmasons.org` and `www.divisionivmasons.org` as permitted hostnames to the *existing* Turnstile site key. Preserve the current calendar hostname. The public event form relies on Turnstile; if hostname verification fails, the form will not work on the new domain.
3. **Edge Function CORS.** `division-calendar`, `division-lodges`, `division-resources`, and `division-site-settings` already allow `https://divisionivmasons.org`, `https://www.divisionivmasons.org`, and the existing calendar origin. Revalidate this before cutover; retain MFA requirements.
4. **Prepare repository release.** Use the staged source after green GitHub Actions tests; change `CNAME` in the *release commit* from `calendar.divisionivmasons.org` to `divisionivmasons.org`. GitHub Pages must target the same domain in **Settings → Pages**. Do not merge this release while Porkbun is still pointing to Wix or while required login redirects are missing.
5. **Preserve the old calendar address.** One GitHub Pages site has one canonical configured custom domain. Plan a proper redirect/forwarding route for requests to `https://calendar.divisionivmasons.org/` after cutover. Porkbun URL forwarding supports redirect types; use a reversible temporary redirect first. Decide where old `calendar.html` links should land, and avoid accidentally forwarding a path onto `/events/` twice. Keep the old subdomain in existing Auth redirect and CORS settings until forwarding has been verified.

## DNS values for Porkbun during the authorized cutover

These are the GitHub Pages documented IP values, **not instructions to change DNS before the release window**.

| Record | Host | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | scottxian.github.io |

Remove conflicting apex A/AAAA/ALIAS records only after reviewing existing Porkbun DNS. Never remove MX/TXT email records. If the GitHub Pages apex domain is set correctly, the www variant can redirect to the canonical apex domain. Turn on/verify **Enforce HTTPS** after GitHub has provisioned the certificate. DNS and HTTPS propagation can take time.

GitHub documentation: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site  
Supabase redirect URL documentation: https://supabase.com/docs/guides/auth/redirect-urls  
Porkbun forwarding documentation: https://kb.porkbun.com/article/39-how-to-set-up-url-forwarding

## After-domain live acceptance checklist

- Visit each of the five URLs in Chrome/Safari desktop and mobile: `/`, `/calendar/`, `/lodges/`, `/events/`, `/inspectors/`.
- Verify the public calendar embeds the expected Division IV Google Calendar, public lodge search/filters work, and event request/changing/canceling forms open.
- Submit **one clearly labeled test event request** through the new domain (do not auto-publish). Confirm server-side Turnstile passes, the request enters the approval queue, and confirmation emails/links are correct.
- Sign in using an *approved* inspector email link redirected to `/inspectors/`; verify MFA challenge, resources download/history, review privileges, and that administrator-only buttons are not exposed.
- Sign in using an administrator email link; verify MFA, lodge/staff/settings management and a harmless reversible edit. Verify no private data is accessible before MFA.
- Check an anonymous/private-file attempt is denied and disabled staff cannot access Inspector Desk even with an existing email-authenticated session.
- Confirm `https://www.divisionivmasons.org/` redirects securely to the apex and `https://calendar.divisionivmasons.org/` follows the approved legacy URL forwarding behavior.
- Once all above checks pass, update Supabase `system_settings` website link keys through the administrator Website Settings UI:
   - `website_site_url` → `https://divisionivmasons.org`
   - `website_event_request_url` → `https://divisionivmasons.org/events/`
   - `website_inspector_desk_url` → `https://divisionivmasons.org/inspectors/`
   - `website_calendar_fallback_url` → `https://divisionivmasons.org/calendar/`
  Preserve other public settings and the live Google Calendar ID. Check outgoing mail link templates after updates.
- Leave Wix active until the new website has been checked on the actual domain. Archive/retire Wix only after confirmation.

## Rollback plan

1. Pause further changes; keep the Supabase project and Google Calendar untouched.
2. Restore the GitHub Pages source from `backup-live-calendar-before-unified-site` into `main` using a controlled revert/merge (do not force-push unreviewed history).
3. Restore GitHub Pages custom domain and CNAME to `calendar.divisionivmasons.org`.
4. Restore prior Porkbun routing for the calendar subdomain. The previous Wix public host is kept intact.
5. Retain both old and new Auth redirect/CORS entries until rollback works. If any `system_settings` URL keys were changed, restore their previous Wix/calendar values.
6. Confirm the old Inspector Desk, magic-link login, MFA challenge, and public calendar function before declaring rollback complete.

## Current release decision

**GO for staging-quality public UI and structural readiness. NO-GO for production cutover until Auth redirect URLs, Turnstile allowed hostnames, the old-calendar redirect plan, and final actual-domain acceptance checks are finished.** No DNS or release merge should occur silently.
