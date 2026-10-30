import assert from 'node:assert/strict';
import { calendarTitle, calendarNotes, lodgeNumberFromHost } from '../supabase/functions/division-jobs/calendar-format.mjs';

const woodland = {lodge_name:'Woodland',lodge_number:'81',abbreviation:'Woodland No. 81'};
const harding = {lodge_name:'Harding San Juan',lodge_number:'579',abbreviation:'Harding SJ No. 579'};
assert.equal(lodgeNumberFromHost('Woodland Lodge No. 81'),'81');
assert.equal(lodgeNumberFromHost('Laguna Lux Lodge #897'),'897');
assert.equal(lodgeNumberFromHost('Division IV'),'');
assert.equal(calendarTitle({title:'Woodland Lodge No. 81: Master Mason Degree',hosted_by:'Woodland Lodge No. 81',event_type:'Master Mason Degree'},woodland),'Woodland No. 81: Master Mason Degree');
assert.equal(calendarTitle({title:'Master Mason Degree',hosted_by:'Woodland Lodge No. 81'},woodland),'Woodland No. 81: Master Mason Degree');
assert.equal(calendarTitle({title:'Woodland No. 81: Master Mason Degree',hosted_by:'Woodland Lodge No. 81'},woodland),'Woodland No. 81: Master Mason Degree');
assert.equal(calendarTitle({title:'Double 1st Degree',hosted_by:'Harding San Juan Lodge No. 579'},harding),'Harding SJ No. 579: Double 1st Degree');
assert.equal(calendarTitle({title:'Division School of Instruction: Mount Oso Lodge No. 460',hosted_by:'Division IV',event_type:'Division School of Instruction'}),'Division School of Instruction: Mount Oso Lodge No. 460');
assert.equal(calendarTitle({title:'Division Leadership Meeting',hosted_by:'Division IV'}),'Division IV: Division Leadership Meeting');
const description='Candidate: Bro. Eric Carlson\nAttire: Dark Suit (no tuxedo required)\nRefreshments served after the degree.';
const notes=calendarNotes({public_description:description,district:'418',hosted_by:'Woodland Lodge No. 81',cost_details:'No charge',poc_name:'David Goold'},{contactDetails:'Point of contact: David Goold'});
assert.ok(notes.startsWith(description+'\n\nDistrict: 418\n\nHosted by Woodland Lodge No. 81'));
assert.ok(notes.endsWith('Point of contact: David Goold'));
assert.ok(!notes.includes('District: District'));
const fullDetails=calendarNotes({
 public_description:'Fellowship evening',district:'428',attire:'Coat and tie',
 invited_audience:'All Masons, spouses and guests',flyer_url:'https://example.org/flyer.pdf',
 hosted_by:'Elk Grove Lodge No. 173',registration_url:'https://example.org/register'
});
assert.ok(fullDetails.startsWith('Fellowship evening\n\nDistrict: 428\n\nAttire: Coat and tie\n\nAttendees: All Masons, spouses and guests\n\nFlyer: https://example.org/flyer.pdf'));
assert.ok(fullDetails.includes('Registration: https://example.org/register'));
const omitted=calendarNotes({public_description:'One event',district:'428',attire:'',invited_audience:null,flyer_url:''});
assert.ok(!omitted.includes('Attendees:')&&!omitted.includes('Flyer:')&&!omitted.includes('Attire:'));
const noDistrict=calendarNotes({public_description:'Topics: lodge instruction',district:null,hosted_by:'Division IV'});
assert.ok(!noDistrict.includes('District:'));
console.log('PASS: calendar publishing title, district, attire, attendees and flyer assertions');
