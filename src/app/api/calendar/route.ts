import { NextRequest, NextResponse } from "next/server";
import { createCalendarEvent, CalendarEventInput } from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, tokens } = body as {
      event: CalendarEventInput;
      tokens: { access_token?: string; refresh_token?: string };
    };

    if (!tokens?.access_token) {
      return NextResponse.json(
        { error: "Not authenticated. Please connect Google Calendar first." },
        { status: 401 }
      );
    }

    if (!event?.startDateTime) {
      return NextResponse.json(
        { error: "Missing required event details (startDateTime)." },
        { status: 400 }
      );
    }

    const result = await createCalendarEvent(event, tokens);

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      htmlLink: result.htmlLink,
    });
  } catch (error: unknown) {
    console.error("Calendar event creation error:", error);
    const message = error instanceof Error ? error.message : "Failed to create event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
