"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Phone, PhoneOff, Calendar, Loader2, ExternalLink } from "lucide-react";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface ChatMsg {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

interface CalendarTokens {
  access_token: string;
  refresh_token?: string;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type ListeningState = "idle" | "listening" | "processing" | "speaking";

// Extend Window for webkitSpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export default function VoiceAssistant() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<Message[]>([]);
  const [listeningState, setListeningState] = useState<ListeningState>("idle");
  const [calendarTokens, setCalendarTokens] = useState<CalendarTokens | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [createdEventLink, setCreatedEventLink] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const calendarTokensRef = useRef<CalendarTokens | null>(null);
  const chatHistoryRef = useRef<ChatMsg[]>([]);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => { calendarTokensRef.current = calendarTokens; }, [calendarTokens]);

  // Check for OAuth tokens in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const authenticated = params.get("authenticated");

    if (authenticated === "true" && accessToken) {
      const tokens: CalendarTokens = {
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
      };
      setCalendarTokens(tokens);
      setIsAuthenticated(true);
      sessionStorage.setItem("calendar_tokens", JSON.stringify(tokens));
      window.history.replaceState({}, "", "/");
    } else {
      const stored = sessionStorage.getItem("calendar_tokens");
      if (stored) {
        const tokens = JSON.parse(stored);
        setCalendarTokens(tokens);
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimTranscript]);

  const addMsg = useCallback((role: Message["role"], content: string) => {
    setMessages((prev) => [...prev, { role, content, timestamp: new Date() }]);
  }, []);

  // ── Text-to-Speech ──
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        console.warn("[TTS] Speech synthesis not supported");
        resolve();
        return;
      }
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to pick a natural-sounding voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Natural")
      );
      if (preferred) utterance.voice = preferred;

      synthRef.current = utterance;
      utterance.onend = () => {
        synthRef.current = null;
        resolve();
      };
      utterance.onerror = () => {
        synthRef.current = null;
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // ── Speech Recognition Factory ──
  function createRecognition() {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new (SpeechRecognition as new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      abort: () => void;
      onresult: ((event: SpeechRecognitionEvent) => void) | null;
      onend: (() => void) | null;
      onerror: ((event: Event & { error: string }) => void) | null;
      onspeechend: (() => void) | null;
    })();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    return recognition;
  }

  // ── Handle calendar event creation ──
  const handleCalendarEvent = useCallback(
    async (args: string): Promise<string> => {
      try {
        const parsed = JSON.parse(args);
        let startDateTime = parsed.start_date_time;
        const meetingTitle = parsed.meeting_title || `Meeting with ${parsed.attendee_name}`;
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Ensure start has timezone — if bare like "2026-02-27T15:00:00", append local offset
        const startDate = new Date(startDateTime);
        if (isNaN(startDate.getTime())) {
          return JSON.stringify({ success: false, error: `Invalid start date: ${startDateTime}` });
        }
        // If no timezone info in the string, build a proper ISO string
        if (!/Z$/.test(startDateTime) && !/[+-]\d{2}:\d{2}$/.test(startDateTime)) {
          const offset = -startDate.getTimezoneOffset();
          const sign = offset >= 0 ? "+" : "-";
          const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
          startDateTime = `${startDateTime}${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`;
        }

        // Compute end time: 1 hour after start
        let endDateTime = parsed.end_date_time;
        if (!endDateTime) {
          const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
          endDateTime = endDate.toISOString();
        }

        console.log("[Calendar] Creating:", { meetingTitle, startDateTime, endDateTime, userTimeZone });
        addMsg("system", `📅 Creating event: "${meetingTitle}" on ${startDate.toLocaleString()}`);

        const tokens = calendarTokensRef.current;
        if (!tokens) {
          return JSON.stringify({ success: false, error: "Google Calendar not connected." });
        }

        const response = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: { summary: meetingTitle, startDateTime, endDateTime, attendeeName: parsed.attendee_name, timeZone: userTimeZone },
            tokens,
          }),
        });
        const result = await response.json();

        if (result.success) {
          setCreatedEventLink(result.htmlLink);
          addMsg("system", "✅ Event created successfully!");
          return JSON.stringify({ success: true, eventId: result.eventId, htmlLink: result.htmlLink });
        } else {
          addMsg("system", `❌ Failed: ${result.error}`);
          return JSON.stringify({ success: false, error: result.error });
        }
      } catch (error) {
        console.error("Calendar error:", error);
        return JSON.stringify({ success: false, error: "Failed to create event." });
      }
    },
    [addMsg]
  );

  // ── Send message to chat API and get response ──
  const sendToChat = useCallback(
    async (userText?: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setListeningState("processing");

      try {
        // Add user message to history
        if (userText) {
          chatHistoryRef.current.push({ role: "user", content: userText });
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatHistoryRef.current }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "API error" }));
          throw new Error(errData.error || `Chat failed (${res.status})`);
        }

        const data = await res.json();

        if (data.type === "function_call" && data.functionName === "create_calendar_event") {
          // Execute the function
          const funcResult = await handleCalendarEvent(data.arguments);

          // Add the assistant message with tool_call and the tool result to history
          chatHistoryRef.current.push(data.message);
          chatHistoryRef.current.push({
            role: "tool",
            content: funcResult,
            tool_call_id: data.message.tool_calls[0].id,
          });

          // Get the follow-up response (reset processing flag so recursive call works)
          processingRef.current = false;
          await sendToChat();
          // Don't resume listening here — the recursive call handles it
          return;
        }

        // Normal text response
        const reply = data.content || "I'm sorry, I didn't understand that.";
        chatHistoryRef.current.push({ role: "assistant", content: reply });
        addMsg("assistant", reply);

        // Speak the response
        if (activeRef.current) {
          setListeningState("speaking");
          await speak(reply);
        }

        // Resume listening after speaking
        processingRef.current = false;
        if (activeRef.current) {
          startListeningRef.current();
        }
      } catch (error) {
        console.error("[Chat] Error:", error);
        addMsg("system", `⚠️ ${error instanceof Error ? error.message : "Chat error"}`);
        // Resume listening even after an error
        processingRef.current = false;
        if (activeRef.current) {
          startListeningRef.current();
        }
      }
    },
    [addMsg, handleCalendarEvent, speak]
  );

  // ── Start listening for voice input ──
  const startListening = useCallback((): void => {
    if (!activeRef.current) return;

    setListeningState("listening");
    setInterimTranscript("");

    const recognition = createRecognition();
    if (!recognition) {
      addMsg("system", "⚠️ Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
      }

      if (final.trim()) {
        setInterimTranscript("");
        addMsg("user", final.trim());
        sendToChat(final.trim());
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      if (event.error === "no-speech") {
        // Normal — browser timed out waiting for speech, just restart
        if (activeRef.current) setTimeout(() => startListening(), 300);
      } else if (event.error === "aborted") {
        // Normal — recognition was stopped/restarted
      } else {
        console.warn("[STT] Error:", event.error);
        addMsg("system", `⚠️ Microphone error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still active and not processing
      if (activeRef.current && !processingRef.current) {
        setTimeout(() => startListening(), 300);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn("[STT] Start failed:", e);
    }
  }, [addMsg, sendToChat]);

  // Keep startListening ref in sync
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── Connect: start the conversation ──
  const connect = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;

    setStatus("connecting");
    setMessages([]);
    setCreatedEventLink(null);
    chatHistoryRef.current = [];
    setInterimTranscript("");

    // Load voices (needed for some browsers)
    window.speechSynthesis?.getVoices();

    setStatus("connected");
    setListeningState("processing");

    // Send initial empty message to get the greeting
    addMsg("system", "🎤 Connected! The assistant will greet you shortly...");

    try {
      await sendToChat("Hello");
    } catch (error) {
      console.error("[Connect] Error:", error);
      addMsg("system", `❌ ${error instanceof Error ? error.message : "Connection failed"}`);
      activeRef.current = false;
      setStatus("disconnected");
      setListeningState("idle");
    }
  }, [addMsg, sendToChat]);

  // ── Disconnect ──
  const disconnect = useCallback(() => {
    activeRef.current = false;
    processingRef.current = false;

    // Stop speech recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_e) { /* ignore */ }
      recognitionRef.current = null;
    }

    // Stop text-to-speech
    window.speechSynthesis?.cancel();
    synthRef.current = null;

    setStatus("disconnected");
    setListeningState("idle");
    setInterimTranscript("");
    addMsg("system", "📞 Disconnected.");
  }, [addMsg]);

  const connectCalendar = async () => {
    try {
      const res = await fetch("/api/auth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Auth error:", error);
      addMsg("system", "❌ Failed to start Google Calendar authentication.");
    }
  };

  const listeningLabel = (() => {
    switch (listeningState) {
      case "listening": return "Listening...";
      case "processing": return "Thinking...";
      case "speaking": return "Speaking...";
      default: return "";
    }
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Voice Scheduling Agent
        </h1>
        <p className="text-muted-foreground mt-2">
          Schedule meetings with your voice — powered by AI
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-2xl">
        {/* Google Calendar Connection */}
        <div className="mb-4 flex items-center justify-center">
          {isAuthenticated ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm">
              <Calendar className="w-4 h-4" />
              Google Calendar Connected
            </div>
          ) : (
            <button
              onClick={connectCalendar}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all text-sm font-medium shadow-sm"
            >
              <Calendar className="w-4 h-4" />
              Connect Google Calendar
            </button>
          )}
        </div>

        {/* Chat Area */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="h-[400px] overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && status === "disconnected" && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                  <Mic className="w-8 h-8 text-indigo-500" />
                </div>
                <p className="text-lg font-medium text-foreground">Ready to schedule?</p>
                <p className="text-sm mt-1 max-w-sm">
                  {isAuthenticated
                    ? 'Click "Start Conversation" to begin speaking with the voice assistant.'
                    : "Connect your Google Calendar first, then start a conversation."}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : msg.role === "assistant"
                      ? "bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm"
                      : "bg-gray-50 border border-gray-100 text-gray-600 rounded-bl-md italic"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {/* Interim transcript while listening */}
            {interimTranscript && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-indigo-300 text-white rounded-br-md opacity-60">
                  {interimTranscript}...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Event Link */}
          {createdEventLink && (
            <div className="px-6 py-3 bg-green-50 border-t border-green-100">
              <a
                href={createdEventLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-green-700 hover:text-green-800 text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View Created Event in Google Calendar
              </a>
            </div>
          )}

          {/* Controls */}
          <div className="p-6 border-t border-white/20 bg-white/40 flex items-center justify-center gap-4">
            {status === "disconnected" ? (
              <button
                onClick={connect}
                disabled={!isAuthenticated}
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Phone className="w-5 h-5" />
                Start Conversation
              </button>
            ) : (
              <>
                {/* Status indicator */}
                <div className="flex items-center gap-2 mr-4">
                  {listeningState === "listening" && (
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-indigo-400 rounded-full"
                          style={{
                            animation: `audio-wave 1s ease-in-out ${i * 0.15}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {listeningState === "processing" && (
                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  )}
                  {listeningState === "speaking" && (
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-purple-400 rounded-full"
                          style={{
                            animation: `audio-wave 0.8s ease-in-out ${i * 0.1}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {listeningLabel && (
                    <span className="text-sm font-medium text-gray-500">{listeningLabel}</span>
                  )}
                </div>

                {listeningState === "listening" && (
                  <div className="p-3 rounded-full bg-red-100 text-red-500 animate-pulse">
                    <Mic className="w-5 h-5" />
                  </div>
                )}
                {listeningState !== "listening" && status === "connected" && (
                  <div className="p-3 rounded-full bg-gray-100 text-gray-400">
                    <MicOff className="w-5 h-5" />
                  </div>
                )}

                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Call
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Powered by Web Speech API · OpenAI · Google Calendar
        </p>
      </div>
    </div>
  );
}
