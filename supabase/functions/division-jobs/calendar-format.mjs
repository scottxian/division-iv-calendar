/* Formatting for public Google Calendar listings; no database writes here. */
const display = value => String(value ?? '').replace(/[<>]/g, '').trim();

/** A lodge may be entered as "Example Lodge No. 81" or "Example Lodge #81". */
export function lodgeNumberFromHost(hostedBy) {
 const match = display(hostedBy).match(/(?:\bNo\.?\s*|#\s*)(\d+)\s*$/i);
 return match ? match[1] : '';
}

/** Keep event titles distinct from their host, even when submitters prefix the title. */
export function calendarTitle(event, lodge = null) {
 return display(event?.title).slice(0,1024);
}

/** The district line belongs directly after the description, before other details. */
export function calendarNotes(event, { onlineLink = '', contactDetails = '' } = {}) {
 const description = String(event?.public_description ?? '').trim();
 const district = display(event?.district);
 return [
   description,
   district ? 'District: ' + district : '',
   event?.attire ? 'Attire: ' + display(event.attire) : '',
   event?.invited_audience ? 'Attendees: ' + display(event.invited_audience) : '',
   event?.flyer_url ? 'Flyer: ' + display(event.flyer_url) : '',
   event?.event_mode === 'online' && onlineLink ? 'Online meeting: ' + onlineLink : '',
   event?.hosted_by ? 'Hosted by ' + display(event.hosted_by) : '',
   event?.cost_details ? 'Cost: ' + display(event.cost_details) : '',
   contactDetails,
   event?.registration_url ? 'Registration: ' + event.registration_url : '',
   event?.payment_url ? 'Payment: ' + event.payment_url : ''
 ].filter(Boolean).join('\n\n');
}
