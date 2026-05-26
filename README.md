# TechLearn Academy — Monica, AI Voice Enrollment Agent

Monica is a conversational AI voice agent built on the **Vapi platform**. She helps students register for technical courses through a fully natural voice conversation — no forms, no clicks, just talking.

---

## 🎙️ What is Monica?

Monica is a real-time voice assistant embedded in the TechLearn Academy enrollment dashboard. Students can speak to her directly in the browser or receive a phone call and complete their entire course registration by simply having a conversation.

She is powered by **Vapi's advanced voice AI** with real-time speech-to-text, natural language understanding, and text-to-speech — making her sound and feel like a real human enrollment advisor.

---

## ✨ What Monica Can Do

### 🗣️ Natural Voice Enrollment
Monica guides students through the full enrollment process using conversation. She asks for:
- Their **name**, **email**, and **phone number**
- Their preferred **course** (Python Programming, Generative AI, Agentic AI, Cloud Computing)
- Their preferred **timeslot** (10 AM, 2 PM, or 6 PM)

Once collected, she confirms the details and logs the registration instantly.

### 📱 Works Two Ways

**Talk in the Browser** — Click the microphone sphere on the dashboard. Monica connects live in your browser using the Vapi Web SDK. You can see a real-time scrollable transcript of the entire conversation as it happens.

**Receive a Phone Call** — Enter your phone number and click *"Call Me"*. Monica will call you on your actual phone via Twilio. You complete the enrollment over the phone — same natural conversation, same database logging.

### 📊 Live Enrollment Database
Every registration Monica completes is saved to a live database and displayed in the **Enrollment Log** panel. Records update automatically — no page refresh needed. Each entry shows:
- Student name, email, phone
- Course selected and timeslot booked
- Whether it was a web or phone call
- Exact time of enrollment

### 📂 Course Catalog
Monica knows the following available courses and timeslots:

| Course | Available Slots |
|---|---|
| Python Programming | 10 AM · 2 PM · 6 PM |
| Generative AI | 10 AM · 2 PM · 6 PM |
| Agentic AI | 10 AM · 2 PM · 6 PM |
| Cloud Computing | 10 AM · 2 PM · 6 PM |

---

## 🛠️ Tech Behind Monica

| Layer | Technology |
|---|---|
| Voice AI | [Vapi](https://vapi.ai) — real-time voice assistant platform |
| Frontend | Next.js 16 with Vanilla CSS Modules |
| Phone Calls | Twilio via Vapi outbound dialer |
| Database | Vercel KV (Redis) — serverless, globally replicated |
| Hosting | Vercel (Edge + Serverless Functions) |
| Webhooks | Next.js API Routes — triggered during calls by Vapi |
