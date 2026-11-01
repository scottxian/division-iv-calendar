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


## Known integration issue found during first signup test (October 31, 2026)

The first user received the confirmation email and clicked the confirmation link, but Resend returned HTTP 401: **'This API key is restricted to only send emails'** during contact enrollment. The current `RESEND_API_KEY` is intentionally Send-only for transactional notices; do not upgrade, replace, or expose it.

The newsletter backend now uses a second private environment variable, `RESEND_MARKETING_API_KEY`, for contacts and Broadcasts. Resend currently offers `full_access` or `sending_access` API-key permissions; the Marketing operations need full access. The send-only key continues handling confirmation email delivery.

To connect safely: Resend → API Keys → Create API Key → **Full access**, name `Division IV Marketing`. Save it privately in the Supabase project at **Edge Functions → Secrets** with key `RESEND_MARKETING_API_KEY`. Do not put the secret in the website, GitHub, or chat. The Edge Function reads the secret without a redeploy. The admin Newsletter panel displays whether the Marketing API connection is configured; this is presence-only, not an authenticated provider health test.

Public signup was paused after the failed first confirmation. The original confirmation token remains pending for up to 48 hours and may be retried after installing the secret. **Pending does not equal subscribed.** Keep all automatic sends disabled until successful provider contact creation and unsubscribe tests. 


## Branded HTML email templates
The same **approved Division IV emblem** used in the shared website masthead and security OTP email is used in all newsletter email HTML: `https://divisionivmasons.org/app/assets/division-iv-emblem.png?v=20261028b`. Navy (#0b2138), gold (#d7b56e), cream background, Grand Lodge affiliation and matching footer are centralized in `brandedEmail()` in the newsletter Edge Function. Email markup is inline-styled table HTML suitable for major email clients, with brand text visible when images are blocked.
- Signup confirmation: branded button with one-time 48-hour link; also includes copyable URL and plain-text fallback; remains a Resend transactional message.
- Monthly digest / weekly changes: same brand and event-card layout, corresponding heading/eyebrow, main calendar link, Resend unsubscribe merge tag and plain-text fallback; remain Resend Marketing Broadcasts.
- The approved logo and site host are external HTTPS links; do not attach, inline as Base64, or replace with generic Masonic stock imagery.
- This is a presentation-only change. Signup, MFA, event publication, schedules and broadcast sending settings are unchanged. To inspect, visit Inspector Desk → Newsletter → Preview Monthly / Preview Weekly. Do not turn on sending solely to test styling.

## Returning subscribers — verified opt-in (October 31, 2026)
If a member previously unsubscribed, they may submit the newsletter signup form again even within the initial 12-hour confirmation cooldown. The request sends a **new** 48-hour confirmation link; the address is never reactivated solely by filling in the form. After the member clicks the link, the newsletter function restores the existing global Resend contact with `PATCH /contacts/{id}` and `unsubscribed: false`, rather than trying to create a duplicate contact. It then marks that subscription active locally. The Resend contact must remain in the Division IV newsletter Segment.
