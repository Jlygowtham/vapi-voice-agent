import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const apiKey = process.env.VAPI_PRIVATE_KEY;
    const assistantId = process.env.VAPI_ASSISTANT_ID || '6cee1a72-ba5c-4239-a8d4-a0cd30b2b547';
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Vapi Private API Key (VAPI_PRIVATE_KEY) is not configured on the server.' },
        { status: 500 }
      );
    }

    console.log(`Triggering outbound call to ${phone} using assistant ${assistantId}`);

    const payload = {
      assistantId,
      customer: {
        number: phone,
      },
    };

    // If phone number ID is configured, add it to the payload
    if (phoneNumberId) {
      payload.phoneNumberId = phoneNumberId;
    }

    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('Vapi Call API Response:', data);

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || 'Failed to trigger outbound call via Vapi API' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, call: data });
  } catch (error) {
    console.error('Outbound call error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
