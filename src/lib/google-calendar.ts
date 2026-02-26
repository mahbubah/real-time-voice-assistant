import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function getAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
}

export function getOAuth2Client() {
  return oauth2Client;
}

export async function exchangeCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

export async function setCredentials(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
}) {
  oauth2Client.setCredentials(tokens);
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startDateTime: string; // ISO 8601
  endDateTime: string; // ISO 8601
  attendeeName?: string;
  timeZone?: string;
}

export async function createCalendarEvent(
  event: CalendarEventInput,
  tokens: { access_token?: string | null; refresh_token?: string | null }
): Promise<{ eventId: string; htmlLink: string }> {
  const authClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  authClient.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: authClient });

  // Ensure dateTime strings have timezone info — if not, treat as local time
  const timeZone = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  // Normalize: if the datetime string lacks a timezone offset (no Z, no +/-), add one
  function ensureTimezone(dt: string): string {
    if (!dt) return dt;
    // Already has timezone info
    if (/Z$/.test(dt) || /[+-]\d{2}:\d{2}$/.test(dt)) return dt;
    // Parse and re-format with full ISO including offset
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    return d.toISOString();
  }

  const startDt = ensureTimezone(event.startDateTime);
  const endDt = ensureTimezone(event.endDateTime);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.summary || "Meeting",
      description: event.description || `Meeting scheduled with ${event.attendeeName || "Guest"}`,
      start: {
        dateTime: startDt,
        timeZone,
      },
      end: {
        dateTime: endDt,
        timeZone,
      },
    },
  });

  return {
    eventId: response.data.id || "",
    htmlLink: response.data.htmlLink || "",
  };
}
