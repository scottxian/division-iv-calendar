# Division IV — Hybrid Newsletters

Monthly and weekly newsletter controls are separate in **Inspector Desk → Administration → Newsletter**.

- Monthly: first day of month, 8 AM Pacific, next 60 days by default. Configurable day, hour and lookahead.
- Weekly: Monday, 8 AM Pacific by default. Sends only when new, edited or cancelled published events have flags.
- Every successful publication update triggers a flag, however small. Flags clear only for included event versions after a successful Broadcast submission.
- If the monthly digest and weekly update fall on the same date, monthly takes precedence (weekly skipped).

## Email delivery (one-time)
Go to Inspector Desk → Administration → Settings → **Email Newsletter Delivery — One-time Setup**.

1. In Resend, confirm this account is on a $0 Marketing plan and paid overages are disabled. Verify the total account contact usage, including contacts in unrelated segments.
2. Create a Marketing segment for the Division IV newsletter. Enter its **segment UUID** into the separate setup form (not the API key).
3. Check the no-charge confirmation only after verifying the Resend account's billing details.
4. Save one-time setup. Return to Newsletter and preview monthly and weekly.
5. Test a verified public opt-in and the resulting Resend contact, then unsubscribe; confirm Resend's suppression.
6. Enable public signup from the Subscribers section only after successful testing.
7. Enable monthly and/or weekly automatic sending separately. No email is sent before activation.

**No paid upgrade or billing setting change is performed by this site.** Provider-level billing restrictions must be enforced within the actual Resend account. Local contact cap is 900.

A separate hourly cron checks whether either newsletter is due at its configured local hour (America/Los_Angeles). This accommodates daylight saving and per-newsletter hours. A duplicate-issue key prevents multiple sends of an issue.

Delivery and public sign-up are disabled by default. If a broadcast fails after sending was requested, manual review is required rather than blindly retrying.

The newsletter uses no previous sent-document comparison. Published event version flags are derived from successful Google Calendar sync jobs.

Tables: newsletter_settings, newsletter_subscribers, newsletter_event_flags, newsletter_runs, newsletter_signup_limits.
Migrations: division_iv_newsletter_opt_in_flags_and_runs, division_iv_newsletter_signup_rate_limits, newsletter_service_role_access_and_separate_schedules, newsletter_monthly_weekly_separately_paused.
Function: supabase/functions/division-newsletter/index.ts.
