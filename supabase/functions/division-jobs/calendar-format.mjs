/* Formatting for public Google Calendar listings; no database writes here. */
const display = value => String(value ?? '').replace(/[<>]/g, '').trim();

/** A lodge may be entered as "Example Lodge No. 81" or "Example Lodge #81". */
export function lodgeNumberFromHost(hostedBy) {
 const match = display(hostedBy).match(/(?:\bNo\.?\s*|#\s*)(\d+)\s*$/i);
 return match ? match[1] : '';
}

/** Keep event titles distinct from their host, even when submitters prefix the title. */
export function calendarTitle(event, lodge = null) {
 const title = display(event?.title);
 if (!title) return '';
 // Division School of Instruction has its own established title convention.
 if (event?.event_type === 'Division School of Instruction') return title.slice(0, 1024);
 const host = display(event?.hosted_by);
 const abbreviated = display(lodge?.abbreviation);
 const prefix = abbreviated || host;
 if (!prefix) return title.slice(0, 1024);
 const variants = [
   host, abbreviated,
   lodge?.lodge_name && lodge?.lodge_number ? lodge.lodge_name + ' Lodge No. ' + lodge.lodge_number : '',
   lodge?.lodge_name && lodge?.lodge_number ? lodge.lodge_name + ' No. ' + lodge.lodge_number : '',
   lodge?.lodge_name && lodge?.lodge_number ? lodge.lodge_name + ' Lodge #' + lodge.lodge_number : '',
   lodge?.lodge_name && lodge?.lodge_number ? lodge.lodge_name + ' #' + lodge.lodge_number : ''
 ].map(display).filter(Boolean).sort((a, b) => b.length - a.length);
 let eventTitle = title;
 for (const candidate of variants) {
   if (title.toLowerCase().startsWith((candidate + ':').toLowerCase())) {
     eventTitle = title.slice(candidate.length + 1).trim();
     break;
   }
 }
 return (prefix + ': ' + (eventTitle || title)).slice(0, 1024);
}

/** The district line belongs directly after the description, before other details. */
export function calendarNotes(event, { onlineLink = '', contactDetails = '' } = {}) {
 const description = String(event?.public_description ?? '').trim();
 const district = display(event?.district);
 return [
   description,
   district ? 'District: ' + district : '',
   event?.event_mode === 'online' && onlineLink ? 'Online meeting: ' + onlineLink : '',
   event?.hosted_by ? 'Hosted by ' + display(event.hosted_by) : '',
   event?.cost_details ? 'Cost: ' + display(event.cost_details) : '',
   contactDetails,
   event?.registration_url ? 'Registration: ' + event.registration_url : '',
   event?.payment_url ? 'Payment: ' + event.payment_url : ''
 ].filter(Boolean).join('\n\n');
}
