import { streamText, tool, convertToModelMessages, isStepCount } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

export const maxDuration = 30;

const rawKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY ||
  "";

const apiKey = rawKey.replace(/^["']|["']$/g, "").trim();

const google = createGoogleGenerativeAI({
  apiKey: apiKey || undefined,
});

interface IncomingPart {
  type: string;
  text?: string;
}

interface IncomingMessage {
  role: "system" | "user" | "assistant";
  content?: string;
  parts?: IncomingPart[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: IncomingMessage[] };
    const rawMessages = body.messages;

    // Support both standard UI message parts and raw content strings
    const normalizedMessages = Array.isArray(rawMessages)
      ? rawMessages.map((m: IncomingMessage) =>
          m.parts
            ? m
            : {
                ...m,
                parts: [{ type: "text", text: typeof m.content === "string" ? m.content : "" }],
              }
        )
      : [];

    const modelMessages = await convertToModelMessages(
      normalizedMessages as Parameters<typeof convertToModelMessages>[0]
    );

    const agronomySchema = z.object({
      latitude: z.number().describe("Latitude of the farm location"),
      longitude: z.number().describe("Longitude of the farm location"),
    });

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const result = streamText({
      model: google(modelName),
      system:
        "You are WeatherGPT, an elite Agricultural Decision Engine. Never guess the weather. Always use the 'get_agronomy_data' tool first. Evaluate risk for sowing/spraying based on Open-Meteo wind and soil moisture data. Always respond directly in conversational Hinglish.",
      messages: modelMessages,
      stopWhen: isStepCount(5),
      tools: {
        get_agronomy_data: tool({
          description:
            "Fetch real-time agronomy weather and soil data including temperature, wind speed, precipitation probability, and soil moisture.",
          inputSchema: agronomySchema,
          execute: async ({ latitude, longitude }) => {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,wind_speed_10m,precipitation_probability,soil_moisture_0_to_1cm`;
            const res = await fetch(url);
            if (!res.ok) {
              throw new Error(`Failed to fetch weather data: ${res.statusText}`);
            }
            return await res.json();
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
