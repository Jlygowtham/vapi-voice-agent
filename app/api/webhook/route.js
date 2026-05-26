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

    // Default response for other hook messages
    return NextResponse.json({ status: 'ignored', type: message.type });
  } catch (error) {
    console.error('Webhook handler crashed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
