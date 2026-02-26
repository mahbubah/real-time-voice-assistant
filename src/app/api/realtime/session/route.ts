import { NextResponse } from "next/server";

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          modalities: ["text", "audio"],
          voice: "verse",
          instructions: `You are a friendly and professional voice scheduling assistant. Your goal is to help users schedule calendar events.

Follow this conversation flow:
1. Greet the user warmly and ask for their name.
2. Once you have their name, ask what date and time they'd like to schedule a meeting.
3. Optionally ask if they have a title or topic for the meeting.
4. Confirm all the details back to the user (name, date/time, meeting title).
5. Once confirmed, call the "create_calendar_event" function with the collected information.
6. After the event is created, inform the user of the success and provide the event link if available.

Important guidelines:
- Be conversational and natural — this is a voice interaction.
- Parse dates and times flexibly (e.g., "next Tuesday at 3pm", "tomorrow morning", "January 5th at 2:30").
- If the user doesn't provide a meeting title, use "Meeting with [name]" as default.
- Default meeting duration is 1 hour unless specified otherwise.
- Always confirm details before creating the event.
- Convert all times to ISO 8601 format when calling the function.
- Keep responses concise since this is voice.`,
          tools: [
            {
              type: "function",
              name: "create_calendar_event",
              description:
                "Creates a calendar event with the specified details. Call this after the user confirms their meeting details.",
              parameters: {
                type: "object",
                properties: {
                  attendee_name: {
                    type: "string",
                    description: "The name of the person scheduling the meeting",
                  },
                  meeting_title: {
                    type: "string",
                    description:
                      "The title/topic of the meeting. Defaults to 'Meeting with [name]' if not provided",
                  },
                  start_date_time: {
                    type: "string",
                    description:
                      "The start date and time in ISO 8601 format (e.g., 2025-03-15T14:00:00Z)",
                  },
                  end_date_time: {
                    type: "string",
                    description:
                      "The end date and time in ISO 8601 format. Defaults to 1 hour after start if not specified",
                  },
                },
                required: ["attendee_name", "start_date_time"],
              },
            },
          ],
          tool_choice: "auto",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI session creation failed:", errorText);
      return NextResponse.json(
        { error: `Failed to create session: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
