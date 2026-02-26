# Voice Scheduling Agent

A real-time voice assistant that helps users schedule Google Calendar events through natural conversation. Built with **Next.js**, **Groq** (free LLM), **Web Speech API** (browser-native STT/TTS), and **Google Calendar API**.

🚀 **[Live Demo](https://real-time-voice-assistant.vercel.app/)** — Try it now!

## Demo Video

<div>
  <a href="https://www.loom.com/share/6b3c190e13da4122b8b7d7e20d621126">
    <img style="max-width:300px;" src="https://cdn.loom.com/sessions/thumbnails/6b3c190e13da4122b8b7d7e20d621126-with-play.gif">
  </a>
</div>

## Features

- **Real-time voice conversation** — Talk naturally to schedule meetings using your browser's built-in speech recognition
- **Intelligent scheduling** — Understands flexible date/time expressions ("next Tuesday at 3pm", "tomorrow morning")
- **Google Calendar integration** — Creates real calendar events via OAuth2
- **Live transcription** — See the conversation in real-time as you speak
- **Text-to-speech responses** — The assistant speaks back to you using browser-native TTS
- **100% free** — No paid API keys required (Groq free tier + browser APIs)
- **Modern UI** — Glassmorphism design with audio visualizations

## Architecture

```
┌──────────────────────────────────────┐
│              Browser                 │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Web Speech │  │ Web Speech     │  │
│  │ Recognition│  │ Synthesis      │  │
│  │ (STT)      │  │ (TTS)          │  │
│  └──────┬─────┘  └───────▲────────┘  │
│         │                │           │
│         ▼                │           │
│  ┌──────────────────────────────┐    │
│  │     React UI + Chat Logic    │    │
│  └──────────────┬───────────────┘    │
└─────────────────┼────────────────────┘
                  │ REST API
                  ▼
           ┌──────────────┐       ┌──────────────┐
           │  Next.js API │──────►│   Groq API   │
           │   Routes     │       │ (Llama 3.3)  │
           └──────┬───────┘       └──────────────┘
                  │
                  ▼
           ┌──────────────┐
           │   Google     │
           │  Calendar API│
           └──────────────┘
```

### How it works

1. The user clicks "Start Conversation" — the browser requests microphone access
2. The assistant sends an initial greeting via the Groq LLM and speaks it aloud using Web Speech Synthesis (TTS)
3. The browser's Web Speech Recognition (STT) listens for the user's voice and transcribes it to text
4. The transcribed text is sent to the `/api/chat` route, which forwards it to Groq's Llama 3.3 70B model
5. The LLM processes the conversation and responds — the response is spoken aloud via TTS
6. When the user confirms meeting details, the LLM triggers a `create_calendar_event` function call
7. The frontend sends the event details to the `/api/calendar` route, which creates the event in Google Calendar
8. The result is sent back through the LLM so the assistant can confirm verbally

### Calendar Integration

The app uses **Google Calendar API v3** with OAuth2 for authentication:

- **OAuth2 flow**: User clicks "Connect Google Calendar" → redirected to Google consent screen → tokens returned via callback
- **Token handling**: Access and refresh tokens are stored in the browser's session storage (per-session, not persisted)
- **Event creation**: Uses `calendar.events.insert` on the user's primary calendar
- **Scopes**: Only requests `calendar.events` (minimal permission to create events)

## Prerequisites

- **Node.js** 18+
- **Groq API key** (free — get one at [console.groq.com](https://console.groq.com))
- **Google Cloud project** with Calendar API enabled and OAuth2 credentials
- **Chrome or Edge browser** (required for Web Speech API support)

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd real-time-voice-assistant
npm install
```

### 2. Google Cloud Console setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback`
7. Copy the **Client ID** and **Client Secret**

### 3. Environment variables

```
GROQ_API_KEY=gsk_your-groq-api-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome or Edge** (required for speech recognition).

### 5. Testing the agent

1. Click **"Connect Google Calendar"** and authorize the app
2. Click **"Start Conversation"** and allow microphone access
3. Speak naturally — e.g., *"Hi, I'd like to schedule a meeting"*
4. The assistant will ask for your name, preferred date/time, and optional meeting title
5. Confirm the details and the event will be created in your Google Calendar

## Deployment (Vercel)

1. Push to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add all environment variables in the Vercel dashboard
4. Update `GOOGLE_REDIRECT_URI` and `NEXT_PUBLIC_BASE_URL` to your deployed URL
5. Add the deployed redirect URI to your Google Cloud OAuth2 credentials

## Tech Stack

| Component | Technology |
|-----------|----------|
| Framework | Next.js 14 (App Router) |
| Speech-to-Text | Web Speech API (browser-native, free) |
| Text-to-Speech | Web Speech Synthesis (browser-native, free) |
| LLM | Groq — Llama 3.3 70B Versatile (free tier) |
| Calendar | Google Calendar API v3 |
| Auth | Google OAuth2 |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Deployment | Vercel |
