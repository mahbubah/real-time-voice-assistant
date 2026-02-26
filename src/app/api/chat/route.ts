import { NextRequest, NextResponse } from "next/server";

function getSystemPrompt() {
  const now = new Date();
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const tzOffset = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;

  return `You are a friendly and professional voice scheduling assistant. Your goal is to help users schedule calendar events.

Follow this conversation flow:
1. Greet the user warmly and ask for their name.
2. Once you have their name, ask what date and time they'd like to schedule a meeting.
3. Optionally ask if they have a title or topic for the meeting.
4. Confirm all the details back to the user (name, date/time, meeting title).
5. Once confirmed, call the "create_calendar_event" function with the collected information.
6. After the event is created, inform the user of the success.

Important guidelines:
- Be conversational and natural — this is a voice interaction, keep responses short (1-2 sentences).
- Parse dates and times flexibly (e.g., "next Tuesday at 3pm", "tomorrow morning", "January 5th at 2:30").
- If the user doesn't provide a meeting title, use "Meeting with [name]" as default.
- Default meeting duration is 1 hour unless specified otherwise.
- Always confirm details before creating the event.
- CRITICAL: When calling create_calendar_event, all datetimes MUST be in full ISO 8601 with timezone offset, e.g. "2026-02-27T15:00:00${tzOffset}". NEVER omit the timezone offset.
- The end_date_time must always be AFTER the start_date_time (default: 1 hour later).
- Current date/time: ${now.toISOString()} (timezone: ${tzName}, offset: ${tzOffset}).`;
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
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
              "The start date and time in ISO 8601 format (e.g., 2025-03-15T14:00:00)",
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
  },
];

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured. Get a free key at https://console.groq.com" },
        { status: 500 }
      );
    }

    const { messages } = await req.json();

    const chatMessages = [
      { role: "system", content: getSystemPrompt() },
      ...messages,
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: chatMessages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.7,
          max_tokens: 300,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", errText);
      return NextResponse.json(
        { error: `LLM API error (${response.status}): ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      return NextResponse.json(
        { error: "No response from model" },
        { status: 500 }
      );
    }

    // Check if there's a function/tool call
    if (choice.message?.tool_calls?.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      return NextResponse.json({
        type: "function_call",
        functionName: toolCall.function.name,
        arguments: toolCall.function.arguments,
        message: choice.message,
      });
    }

    return NextResponse.json({
      type: "message",
      content: choice.message?.content || "",
      message: choice.message,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
