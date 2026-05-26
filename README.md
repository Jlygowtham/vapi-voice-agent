# TechLearn Academy: Vapi Voice Agent Sandbox

This is a premium Next.js testbed and dashboard built to display, test, and audit the **Swetha** (Vapi Voice Assistant) registration flow. It provides a web-based testing client, a Twilio phone dialer, and an automated registration logging mechanism using Vercel KV.

---

## 🌟 Key Features

*   **In-Browser Call SDK**: Connect directly to Swetha in your browser with real-time volume indicators, active audio rings, and a live scrollable transcript feed.
*   **Secure Twilio Outbound Dialer**: Enter your phone number and trigger a direct phone call from your Twilio number via the serverless backend.
*   **Vapi Webhook Endpoint (`/api/webhook`)**: Receives the `register_class` tool callback from Vapi, stores registrations, and returns the formatted response to allow Swetha to confirm the enrollment.
*   **Live Registration Logger**: Built using **Vercel KV (Redis)**. Any successful registration made on the web or via Twilio phone line instantly logs here.
*   **Local Fallback**: Automatically falls back to an in-memory database during local testing if Vercel KV is not configured.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Vapi credentials from Vapi dashboard
NEXT_PUBLIC_VAPI_PUBLIC_KEY="your_vapi_public_key"
NEXT_PUBLIC_VAPI_ASSISTANT_ID="6cee1a72-ba5c-4239-a8d4-a0cd30b2b547"
VAPI_PRIVATE_KEY="your_vapi_private_key"
VAPI_PHONE_NUMBER_ID="your_twilio_number_id_in_vapi"

# Vercel KV credentials (auto-injected in production, optional locally)
KV_URL=""
KV_REST_API_URL=""
KV_REST_API_TOKEN=""
KV_REST_API_READ_ONLY_TOKEN=""
```

---

## 🚀 Local Development

1. Install dependencies:
    ```bash
    npm install
    ```
2. Start the development server:
    ```bash
    npm run dev
    ```
3. Open [http://localhost:3000](http://localhost:3000) to test locally.

---

## ☁️ Vercel Deployment

Deploying the app is extremely straightforward:

1.  **Create a New Vercel Project**: Push this codebase to GitHub and link it in Vercel.
2.  **Add Environment Variables**: Paste your Vapi variables (`NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID`, `VAPI_PRIVATE_KEY`, `VAPI_PHONE_NUMBER_ID`) in Vercel.
3.  **Add Vercel KV Storage (1-Click)**:
    *   On the Vercel project dashboard, go to the **Storage** tab.
    *   Select **KV (Redis)** and click **Create**.
    *   Connect it to your project. Vercel will automatically inject the `KV_*` environment variables!
4.  **Connect Webhook in Vapi**:
    *   Once Vercel deploys, copy your production domain (e.g. `https://your-domain.vercel.app`).
    *   In the Vapi Dashboard, open your assistant configuration or the **`register_class` Tool** configuration.
    *   Set the **Server URL** to: `https://your-domain.vercel.app/api/webhook`.

---

## 🎙️ How to Test (For Interviewers)

1.  **Web Call Testing**:
    *   Click the **Microphone icon** on the dashboard.
    *   Grant microphone access. Once connected, greet Swetha.
    *   Register for one of the classes (e.g., **Python Programming** at **10 AM**).
    *   Provide your details (name, email, and phone) when prompted.
    *   Once Swetha completes the registration and says "You're all set", check the table at the bottom of the dashboard. Your registration details will instantly appear!
2.  **Phone Call Testing**:
    *   Input your phone number in the **"Receive a Phone Call"** widget.
    *   Click **Call Me**.
    *   Answer the call, talk to Swetha, and complete the enrollment.
    *   Verify that your registration shows up in the database table with the channel labeled **"Phone line"**.
