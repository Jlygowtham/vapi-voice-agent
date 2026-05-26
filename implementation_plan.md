# Deploying Vapi Voice Assistant to Vercel

We will build a modern, high-fidelity Next.js web application that serves as a complete testing dashboard for the Vapi voice agent. It will support:
1. **Web-based Voice Call**: In-browser voice conversation with the agent using `@vapi-ai/web`.
2. **Outbound Twilio Call**: A secure dialer that triggers outbound phone calls via Vapi's API.
3. **Tool Webhook Integration**: A `/api/webhook` serverless function that handles the `register_class` tool call from Vapi, stores it in Vercel KV (Redis), and returns a success response.
4. **Live Registrations Table**: A real-time updating list showing all registrations made through both web and phone calls.

---

## User Review Required

> [!IMPORTANT]
> To run the app, you will need the following credentials from your Vapi dashboard (and Twilio):
> 1. **Vapi Public Key** (for frontend SDK initialization)
> 2. **Vapi Private API Key** (for backend API authentication)
> 3. **Vapi Phone Number ID** (the ID of your Twilio number in Vapi, required for outbound calls)
> 
> You will add these as Environment Variables in Vercel. No LLM keys are needed, as Vapi handles the LLM logic directly.

> [!TIP]
> We will use **Vercel KV** (1-click Redis database built into Vercel) to store the registration logs. This means when the voice agent successfully registers someone, it will immediately appear on the web dashboard in real-time, making it extremely easy for an interviewer to test and verify the entire loop.

---

## Proposed Changes

We will create a Next.js App Router project in the workspace directory.

### Backend / Serverless Endpoints

#### [NEW] [route.js](file:///d:/My%20projects(2025)/vapi%20voice%20agent/app/api/webhook/route.js)
- Serverless API route to receive the `register_class` tool webhook from Vapi.
- Validates the tool-call request, stores the registration in Vercel KV, and returns the response in the exact JSON format Vapi expects:
  ```json
  {
    "results": [
      {
        "toolCallId": "...",
        "result": { "status": "success", "message": "Registration successful" }
      }
    ]
  }
  ```

#### [NEW] [route.js](file:///d:/My%20projects(2025)/vapi%20voice%20agent/app/api/outbound/route.js)
- Serverless API route to trigger outbound calls using the Vapi HTTP API (`https://api.vapi.ai/call/phone`).
- Uses the server-side `VAPI_PRIVATE_KEY` to keep credentials secure.

#### [NEW] [route.js](file:///d:/My%20projects(2025)/vapi%20voice%20agent/app/api/registrations/route.js)
- Endpoint to fetch recent registrations from Vercel KV so the frontend can display them.

### Frontend Components & Styling

#### [NEW] [page.js](file:///d:/My%20projects(2025)/vapi%20voice%20agent/app/page.js)
- Main dashboard containing:
  - **Status Indicator**: Shows call state (Idle, Connecting, Active, Speaking, Listening).
  - **Audio Wave Visualizer**: Dynamic, hardware-accelerated CSS/canvas animation mapped to the agent's real-time voice volume (`volume-level` event).
  - **Interactive Web Call Button**: Start/Stop in-browser voice session.
  - **Twilio Outbound Form**: Secure input to trigger outbound phone calls.
  - **Real-time Registration Log**: Interactive table displaying candidates registered by the agent.
  - **Interactive Assistant Guide**: Lists the available classes, slots, and rules (for the interviewer to follow).

#### [NEW] [page.module.css](file:///d:/My%20projects(2025)/vapi%20voice%20agent/app/page.module.css)
- Premium global CSS and modules featuring a sleek dark mode (deep slate background, neon indigo/violet gradients, glassmorphism card designs, and micro-interactions).

#### [NEW] [layout.js](file:///d:/My%20projects(2025)/vapi%20voice%20agent/app/layout.js)
- Core App Router layout integrating modern typography (`Inter` or `Outfit` from Google Fonts).

---

## Verification Plan

### Automated/Local Tests
- Run `npm run dev` to verify the React layout and CSS animations locally.
- Test webhook payload handling locally by sending mock POST requests to `/api/webhook`.

### Manual Verification
1. **Web Call**: Click the "Call Assistant" button on the UI, talk to Swetha, register for "Python Programming", and verify that the call completes and details are recorded.
2. **Outbound Call**: Enter a mobile number in the form, click "Call Me", receive the Twilio phone call, complete the registration with Swetha, and check that the web page updates with the registration.
3. **Database logs**: Verify that details appear in the registrations log table.
