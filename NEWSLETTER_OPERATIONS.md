# Division IV Events Newsletter

## Installation state

The subscriber system, change flags, admin controls, newsletter renderer, and sending worker are installed. Public signup and sending are OFF by default.

**Monthly:** first day of the month at 8 AM Pacific, upcoming 60 days.
**Weekly:** Monday at 8 AM Pacific, only if eligible calendar changes exist.
Every published change, however small, is flagged after successful Google Calendar synchronization. Cancellation flags are retained until announced.

## Before turning it on

1. Confirm the actual Division IV Resend account is on the $0 Marketing Free plan. Verify all global contacts (not only this segment) and turn OFF paid overages in the Resend billing settings.
2. Create a Marketing segment in Resend, for example **Division IV Newsletter**. Copy its UUID.
3. Open the Inspector Desk Administration → Newsletter screen, complete MFA, and paste the segment UUID.
4. Verify the sending email address MAIL_FROM and existing RESEND_API_KEY still work for transactional confirmations.
5. Check the free-plan confirmation checkbox only after verifying actual billing and provider contact count; this is a safety acknowledgment, not an automated plan check.
6. Save. Preview monthly and weekly messages, then enable public signup.
7. Subscribe a test email, verify the confirmation, check Resend Marketing contact segmentation, and test unsubscribe behavior.
8. Enable sending only after a signed-off test.

## Safeguards

- Free-plan policy: no paid upgrade or overage configuration is performed by this website; local cap is 900 active contacts.
- Resend Broadcasts are used for newsletters; the confirmation email uses existing transactional Resend email allowance.
- Resend handles unsubscribe links and provider suppression. The local subscriber count may lag unsubscribes until webhook synchronization is added.
- No emails or calendar data are exposed publicly besides the published event feed.
- A successful provider submission clears flags for only the exact event versions sent.
- Broadcast failures require review rather than automatic retry.
- Duplicate issue keys prevent accidental repeat sends.

Supabase schema migrations: `division_iv_newsletter_opt_in_flags_and_runs` and `division_iv_newsletter_signup_rate_limits`.
Edge Function: `division-newsletter`, source in `supabase/functions/division-newsletter/index.ts`.
