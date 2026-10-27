# Division IV website — administrator operations checklist

This guide supplements the Inspector Desk. Perform checks using authorized administrator accounts. It does not automatically schedule or perform checks.

## Weekly
- Review pending public event submissions and change/cancellation requests in the Inspector Desk.
- Check the dashboard for calendar publication or delivery failures, and confirm the Google Calendar reflects recent approvals.
- Review pending entries in the private Corrections tab. Verify proposed changes with the lodge, edit its record through the Lodges tab, then mark the correction completed.
- Confirm public Upcoming Events dates, host lodge names, venues, and Pacific times.

## Monthly
- Review active inspector accounts and administrator assignments against the authorized roster. Verify that MFA is enforced.
- Check uploaded documents and download permissions for the inspector resource library.
- Export or verify the most recent database backup and keep an accessible, protected recovery copy.
- Review GitHub Actions (both staging and Pages deployment) after changes.

## Before a public announcement
- Confirm test events have been canceled through the normal calendar-synchronized process.
- Test the mobile homepage, calendar list and filters, lodge directory search, correction-email draft, and event submission form.
- Confirm GitHub deployment and staging checks pass.
- Verify there are no unintended public links to private inspector resources.

## Responsibilities
- Public event listing: approved and synced calendar records only.
- Lodges: correction requests enter a private Administrator Desk queue; administrators verify details, update lodge records, and track request statuses and notes.
- Backups: GitHub stores website source; Supabase and Google Calendar data need their own backups.
- Sensitive files, private member data, MFA recovery, and service credentials must not be placed in this public repository.
