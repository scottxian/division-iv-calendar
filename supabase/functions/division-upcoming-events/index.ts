// Public, read-only preview of events already published to the Division IV Google Calendar.
// Never return submission records, contact information, private notes, meeting links or credentials.
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const allowedOrigins = new Set([
  'https://divisionivmasons.org',
  'https://www.divisionivmasons.org',
  'https://scottxian.github.io'
]);
const response = (data: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Vary': 'Origin',
      ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {})
    }
  });

Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Vary': 'Origin'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return response({ error: 'GET required' }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return response({ error: 'Origin not permitted' }, 403, origin);

  try {
    // Optional month-scoped calendar browsing. Default response remains future-only
    // for the existing public homepage and event detail consumers.
    const month = new URL(req.url).searchParams.get('month');
    if (month && !/^(20[2-3][0-9])-(0[1-9]|1[0-2])$/.test(month)) {
      return response({ error: 'Use a valid YYYY-MM month' }, 400, origin);
    }
    const year = month ? Number(month.slice(0,4)) : 0;
    const monthIndex = month ? Number(month.slice(5,7))-1 : 0;
    // One-day UTC margins ensure Pacific local midnight events aren't omitted.
    const from = month ? new Date(Date.UTC(year,monthIndex,1)-86400000).toISOString() : '';
    const until = month ? new Date(Date.UTC(year,monthIndex+1,1)+86400000).toISOString() : '';
    let query = db.from('events')
      .select('id,title,event_type,hosted_by,district,starts_at,ends_at,timezone,event_mode,location_name,location_address,location_tbd,public_description,attire,invited_audience')
      .eq('status', 'active')
      .not('google_event_id', 'is', null)
      .not('calendar_last_synced_at', 'is', null);
    query = month
      ? query.lt('starts_at', until).gt('ends_at', from)
      : query.gt('ends_at', new Date().toISOString());
    const { data, error } = await query.order('starts_at', { ascending: true })
      .limit(month ? 250 : 150);
    if (error) throw error;
    const isSelectedMonth = (event: any) => {
      if (!month) return true;
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit'
      }).formatToParts(new Date(event.starts_at));
      return parts.find(x => x.type === 'year')?.value + '-' +
        parts.find(x => x.type === 'month')?.value === month;
    };
    const events = (data || [])
      .filter(isSelectedMonth)
      // Do not feature obvious test entries; those must still be cancelled separately.
      .filter((event: any) => !/^(?:testing|test event|this is a test event)$/i.test(String(event.title || '').trim()))
      .slice(0, month ? 250 : 120)
      .map((event: any) => ({
        id: event.id,
        title: String(event.title || '').slice(0, 180),
        event_type: String(event.event_type || 'Event').slice(0, 120),
        district: String(event.district || '').slice(0, 30),
        public_description: String(event.public_description || '').slice(0, 2500),
        location_address: String(event.location_address || '').slice(0, 220),
        attire: String(event.attire || '').slice(0, 100),
        invited_audience: String(event.invited_audience || '').slice(0, 300),
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        timezone: event.timezone || 'America/Los_Angeles',
        event_mode: event.event_mode === 'online' ? 'online' : event.event_mode === 'hybrid' ? 'hybrid' : 'in_person',
        location_name: String(event.location_name || '').slice(0, 150),
        location_tbd: Boolean(event.location_tbd),
        hosted_by: String(event.hosted_by || '').slice(0, 150)
      }));
    return response({ events }, 200, origin);
  } catch (error) {
    console.error('Public upcoming events lookup failed', error);
    return response({ error: 'Unable to load upcoming events' }, 500, origin);
  }
});
