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
    const { data, error } = await db.from('events')
      .select('title,starts_at,ends_at,timezone,event_mode,location_name,location_tbd,hosted_by')
      .eq('status', 'active')
      .not('google_event_id', 'is', null)
      .not('calendar_last_synced_at', 'is', null)
      .gt('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(30);
    if (error) throw error;
    const events = (data || [])
      // Do not feature obvious test entries; those must still be cancelled separately.
      .filter((event: any) => !/^(?:testing|test event|this is a test event)$/i.test(String(event.title || '').trim()))
      .slice(0, 5)
      .map((event: any) => ({
        title: String(event.title || '').slice(0, 180),
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
