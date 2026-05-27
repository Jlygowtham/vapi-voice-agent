import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

// Ensure in-memory localRegistrations array exists
if (!global.localRegistrations) {
  global.localRegistrations = [];
}

export async function GET() {
  try {
    const isKvConfigured = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    let registrations = [];

    if (isKvConfigured) {
      try {
        // Fetch all registrations from Vercel KV list
        const rawList = await kv.lrange('vapi_registrations', 0, -1);
        registrations = rawList.map(item => {
          if (typeof item === 'string') {
            return JSON.parse(item);
          }
          return item;
        });
      } catch (kvError) {
        console.error('Failed to read from Vercel KV, falling back to local memory:', kvError);
        registrations = global.localRegistrations || [];
      }
    } else {
      registrations = global.localRegistrations || [];
    }

    return NextResponse.json({ registrations });
  } catch (error) {
    console.error('Failed to fetch registrations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Support saving conversation logs from client side
export async function POST(request) {
  try {
    const isKvConfigured = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    const body = await request.json();
    const callId = body.callId;

    if (isKvConfigured) {
      try {
        const rawList = await kv.lrange('vapi_registrations', 0, -1);
        let updated = false;

        const registrations = rawList.map(item => {
          const reg = typeof item === 'string' ? JSON.parse(item) : item;
          if (reg.callId === callId && callId && callId !== 'unknown') {
            reg.transcripts = body.transcripts || [];
            reg.duration = body.duration || 0;
            updated = true;
          }
          return reg;
        });

        if (updated) {
          await kv.del('vapi_registrations');
          for (const reg of registrations.reverse()) {
            await kv.lpush('vapi_registrations', JSON.stringify(reg));
          }
          return NextResponse.json({ success: true, updated: true });
        } else {
          const registration = {
            id: body.id || Math.random().toString(36).substring(7),
            callId: callId || 'unknown',
            name: body.name || 'Monica & Guest',
            email: body.email || '-',
            phone: body.phone || '-',
            class_name: body.class_name || 'Chat Only',
            timeslot: body.timeslot || '-',
            transcripts: body.transcripts || [],
            duration: body.duration || 0,
            createdAt: body.createdAt || new Date().toISOString(),
            source: body.source || 'webCall'
          };
          await kv.lpush('vapi_registrations', JSON.stringify(registration));
          await kv.ltrim('vapi_registrations', 0, 99);
          return NextResponse.json({ success: true, updated: false, registration });
        }
      } catch (kvError) {
        console.error('Failed to post to Vercel KV, falling back to local memory:', kvError);
      }
    }

    // Fallback local memory POST handler
    let updated = false;
    global.localRegistrations = (global.localRegistrations || []).map(reg => {
      if (reg.callId === callId && callId && callId !== 'unknown') {
        reg.transcripts = body.transcripts || [];
        reg.duration = body.duration || 0;
        updated = true;
      }
      return reg;
    });

    if (updated) {
      return NextResponse.json({ success: true, updated: true });
    } else {
      const registration = {
        id: body.id || Math.random().toString(36).substring(7),
        callId: callId || 'unknown',
        name: body.name || 'Monica & Guest',
        email: body.email || '-',
        phone: body.phone || '-',
        class_name: body.class_name || 'Chat Only',
        timeslot: body.timeslot || '-',
        transcripts: body.transcripts || [],
        duration: body.duration || 0,
        createdAt: body.createdAt || new Date().toISOString(),
        source: body.source || 'webCall'
      };
      global.localRegistrations.unshift(registration);
      if (global.localRegistrations.length > 100) {
        global.localRegistrations = global.localRegistrations.slice(0, 100);
      }
      return NextResponse.json({ success: true, updated: false, registration });
    }
  } catch (error) {
    console.error('Failed to post registration:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const isKvConfigured = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
    if (isKvConfigured) {
      await kv.del('vapi_registrations');
    }
    global.localRegistrations = [];
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


