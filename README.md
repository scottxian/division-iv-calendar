# Division IV Calendar Management

A mobile-friendly Division IV Masonic calendar-request website, hosted on GitHub Pages and backed by a **separate** Supabase project.

**Status: Testing. Do not distribute publicly yet.**

**Website:** https://scottxian.github.io/division-iv-calendar/

## What is installed

- `index.html` — new event, change event, cancel event, inspector desk, status log, inspector management, settings.
- `styles.css` — responsive website styling.
- `app.js` — browser-side interaction with Supabase; uses a *publishable* key, not a secret.
- Supabase Edge Functions: `division-calendar` and `division-jobs`.
- Supabase: RLS-secured event, request, staff, history, verification, notification and calendar-job tables.

**This does not replace the live Google Apps Script Version 3.2 yet.** Both projects are separate; the working AGL-owned calendar stays untouched.

## One-time auth setup

In the *Division IV Calendar* Supabase project, open **Authentication → URL Configuration**.

Set **Site URL** and add an **Additional redirect URL**:

```
https://scottxian.github.io/division-iv-calendar/
```

Staff log in using email verification. Only administrator-enabled emails in `staff_accounts` can see review details. The two initial administrators are Scott Christian and Scott Morrison.

Supabase's built-in email sending is rate-limited. Configure appropriate SMTP before broad inspector invitations.

## Current safeguards

- **Public submissions are disabled.** This is deliberate while email and anti-spam protection are unfinished.
- Authorized inspectors can create test requests while logged in.
- Approval saves the decision, audit history, and queues calendar/email jobs. **Queued does not mean sent/published.**
- No database password, Google service key, Supabase service-role key, or transactional email key is in this repository.
- Staff approvals and changes are protected server-side, not just by hidden buttons.

## Calendar and email activation (not yet configured)

The `division-jobs` Supabase Edge Function expects *server-side* secrets:
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Google Cloud service account credentials
- Calendar ID: saved under Supabase `system_settings.calendar_id` (the existing AGL-owned Division IV Masonic Events calendar); this is **not** a secret or an Edge Function environment variable.
- `RESEND_API_KEY` and `MAIL_FROM`: transactional email account with a verified sender
- `PUBLIC_APP_URL`: `https://scottxian.github.io/division-iv-calendar/`
- `JOB_RUNNER_SECRET`: random strong secret for a trusted background scheduler

Share **only the dedicated events calendar**, with *Make changes to events* permission, to the Google service account's email. Do not share personal calendars. Do not enable the job runner or move lodge submissions until a test confirms creation, update, cancellation and error recovery.

To enable anonymous public event submissions later, configure Cloudflare Turnstile's `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY` and verify the live captcha. Keep submission testing restricted until that is completed.

## Migration notes

The current Apps Script requests are not imported yet. We must preserve request IDs and existing Google event IDs when importing, reconcile duplicates, and complete tests before switching links. Full hotel details, optional attachments and some existing form fields remain scheduled for parity work.

## Safety

Never paste private credentials in GitHub issues, source files, client-side JavaScript, or ChatGPT messages. Use the Supabase Secrets interface and a password manager.

This repository is **separate from Westfield Hall Pass**.
