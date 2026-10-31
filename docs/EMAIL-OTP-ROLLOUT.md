# Division IV Calendar — Email verification code rollout

## Status
The website contains the email-code UI and Supabase REST verification logic, preserving legacy magic-link redirect compatibility during migration. **Supabase's hosted Magic Link / OTP email template is a separate project setting and must be updated in the dashboard.**

## Final required project configuration
1. Sign in to Supabase Dashboard for project `lxvceqshpjnjjlllbpaq`.
2. Open **Authentication → Email Templates → Magic Link** (sometimes labeled **Magic Link / OTP**).
3. Set the subject to **Division IV Calendar — Your verification code**.
4. Replace the email body with the contents of `auth-email-otp-template.html` in this directory. Retain the literal variable `{{ .Token }}` and save.
5. Because the existing frontend allows first-time sign-in (`create_user: true`), also update **Confirm Signup** using the same code-only template and subject. Otherwise first-time submitter contacts or inspectors may still receive a signup link instead of a code.
6. Confirm both templates contain **no** `{{ .ConfirmationURL }}` sign-in link and leave the **Invite user** template unchanged.
7. Confirm **Email OTP expiration** under Authentication email-provider settings is appropriate (recommended: 600 seconds / 10 minutes), without changing other sign-in or security settings.

Do not paste sample numbers or actual credentials into the template.

## Testing after enabling the email template
- Open a private browser session and request a code at https://divisionivmasons.org/inspectors/.
- Check that the email contains a six-digit code rather than an authentication link; enter the code on the website.
- Confirm an existing inspector/admin must still enter the separate authenticator-app code before private functions become available.
- Repeat from the installed iPhone Home Screen app; it must stay in the app instead of switching to Safari.
- On https://divisionivmasons.org/events/ choose Update/Cancel, enter an existing submission ID and the *original submitter email*, and verify using the email code (no staff MFA).
- Verify refresh/sign-out and an invalid or expired code. Also test a non-inspector account: email confirmation alone must **not** grant inspector access.

## Rollback
The deployed frontend still accepts legacy email-link redirect sessions. If code email delivery fails, restore the prior Supabase Magic Link and Confirm Signup templates and investigate before modifying MFA or role settings.

## Separation of concerns
Public submission, event-contact verification and staff MFA remain distinct. No database schema change is required for this email-code upgrade.
