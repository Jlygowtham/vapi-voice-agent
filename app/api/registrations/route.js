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

// Support clearing list for testing
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
