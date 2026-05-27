import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

// Fallback in-memory store for local testing when Vercel KV is not configured
if (!global.localRegistrations) {
  global.localRegistrations = [];
}

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Vapi Webhook Received:', JSON.stringify(body, null, 2));

    const message = body.message;
    if (!message) {
      return NextResponse.json({ error: 'No message payload' }, { status: 400 });
    }

    // Handle tool execution requests (specifically 'register_class')
    if (message.type === 'tool-calls') {
      const toolCalls = message.toolCalls || [];
      const results = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function?.name;
        const args = toolCall.function?.arguments || {};

        if (functionName === 'register_class') {
          const registration = {
            id: toolCall.id || Math.random().toString(36).substring(7),
            callId: body.message?.call?.id || 'unknown',
            name: args.name || 'Unknown',
            email: args.email || 'Unknown',
            phone: args.phone || 'Unknown',
            class_name: args.class_name || 'Unknown',
            timeslot: args.timeslot || 'Unknown',
            createdAt: new Date().toISOString(),
            source: body.message?.call?.type || 'webCall'
          };

          console.log('Processing Registration Tool Call:', registration);

          // Check if Vercel KV is configured (using key environment variables)
          const isKvConfigured = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

          if (isKvConfigured) {
            try {
              // Store in Vercel KV list
              await kv.lpush('vapi_registrations', JSON.stringify(registration));
              // Keep list size capped at 100
              await kv.ltrim('vapi_registrations', 0, 99);
              console.log('Successfully saved to Vercel KV');
            } catch (kvError) {
              console.error('Failed to store in Vercel KV, falling back to local memory:', kvError);
              global.localRegistrations.unshift(registration);
            }
          } else {
            console.log('Vercel KV not configured. Saving to local in-memory store.');
            global.localRegistrations.unshift(registration);
            // Cap local memory at 100
            if (global.localRegistrations.length > 100) {
              global.localRegistrations = global.localRegistrations.slice(0, 100);
            }
          }

          results.push({
            toolCallId: toolCall.id,
            result: {
              status: 'success',
              message: `Registration completed successfully for ${registration.name}.`
            }
          });
        } else {
          // Unknown tool call: handle gracefully
          results.push({
            toolCallId: toolCall.id,
            result: {
              status: 'success',
              message: 'Tool handled'
            }
          });
        }
      }

      return NextResponse.json({ results });
    }

    // Handle end-of-call report (captures transcripts, summary, and duration)
    if (message.type === 'end-of-call-report') {
      const callId = message.call?.id;
      const transcript = message.transcript || '';
      const summary = message.summary || '';
      const duration = message.call?.duration || 0;
      const source = message.call?.type || 'webCall';

      console.log(`Processing End of Call Report for call ${callId}`);

      const isKvConfigured = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

      if (isKvConfigured) {
        try {
          const rawList = await kv.lrange('vapi_registrations', 0, -1);
          let updated = false;

          const registrations = rawList.map(item => {
            const reg = typeof item === 'string' ? JSON.parse(item) : item;
            if (reg.callId === callId && callId) {
              reg.transcript = transcript;
              reg.summary = summary;
              reg.duration = duration;
              updated = true;
            }
            return reg;
          });

          if (updated) {
            await kv.del('vapi_registrations');
            for (const reg of registrations.reverse()) {
              await kv.lpush('vapi_registrations', JSON.stringify(reg));
            }
            console.log('Successfully updated registration with webhook transcript');
          } else {
            // Create a new log for chat only
            const newLog = {
              id: Math.random().toString(36).substring(7),
              callId,
              name: 'Monica & Guest',
              email: '-',
              phone: '-',
              class_name: 'Chat Only',
              timeslot: '-',
              transcript,
              summary,
              duration,
              createdAt: new Date().toISOString(),
              source
            };
            await kv.lpush('vapi_registrations', JSON.stringify(newLog));
            await kv.ltrim('vapi_registrations', 0, 99);
            console.log('Successfully saved webhook chat log');
          }
        } catch (kvError) {
          console.error('Failed to update Vercel KV on webhook report:', kvError);
        }
      } else {
        let updated = false;
        global.localRegistrations = (global.localRegistrations || []).map(reg => {
          if (reg.callId === callId && callId) {
            reg.transcript = transcript;
            reg.summary = summary;
            reg.duration = duration;
            updated = true;
          }
          return reg;
        });

        if (!updated) {
          const newLog = {
            id: Math.random().toString(36).substring(7),
            callId,
            name: 'Monica & Guest',
            email: '-',
            phone: '-',
            class_name: 'Chat Only',
            timeslot: '-',
            transcript,
            summary,
            duration,
            createdAt: new Date().toISOString(),
            source
          };
          global.localRegistrations.unshift(newLog);
          if (global.localRegistrations.length > 100) {
            global.localRegistrations = global.localRegistrations.slice(0, 100);
          }
        }
        console.log('Successfully updated local memory chat log');
      }

      return NextResponse.json({ success: true });
    }

    // Default response for other hook messages
    return NextResponse.json({ status: 'ignored', type: message.type });
  } catch (error) {
    console.error('Webhook handler crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
