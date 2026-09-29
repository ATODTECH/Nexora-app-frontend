import { serve } from "https://deno.land/std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_MODEL = Deno.env.get("GROQ_TEXT_MODEL") || "openai/gpt-oss-20b";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5";

const GEMINI_MODELS = (
  Deno.env.get("GEMINI_VISION_MODELS") ||
  "gemini-3.6-flash,gemini-3.5-flash"
)
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const SYSTEM_INSTRUCTION = `
You are Nexora AI, the intelligent AI business assistant of Nexora AI.

You are helpful, intelligent, professional, friendly, and practical.

Your primary purpose is to help business owners and teams manage, understand, and grow their businesses.

Give clear, accurate, useful, and actionable answers.

When appropriate:
- Use headings.
- Use bullet points.
- Use numbered steps.
- Give practical examples.
- Explain technical concepts simply.
- Ask a concise clarification question when important information is missing.

Do not claim to have access to business data, documents, customers, orders, finances, or other private information unless that information has actually been provided through the application.

When business context is provided, use it carefully and prioritize the provided information.

If the user provides an image, carefully inspect it and describe only what can reasonably be determined from the image.
`;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fetchImageAsBase64(imageUrl: string) {
  const res = await fetch(imageUrl);

  if (!res.ok) {
    throw new Error(`Could not fetch uploaded image (HTTP ${res.status}).`);
  }

  const mediaType = res.headers.get("content-type") || "";

  if (!mediaType.startsWith("image/")) {
    throw new Error("The uploaded file link did not return an image.");
  }

  const buffer = await res.arrayBuffer();

  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error("The uploaded image is too large. Maximum size is 5 MB.");
  }

  return {
    base64: arrayBufferToBase64(buffer),
    mediaType,
  };
}

/* ========================= GROQ TEXT ========================= */

async function callGroqText(message: string, key: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: message },
      ],
      max_tokens: 2048,
    }),
  });

  const raw = await res.text();

  console.log(`[Groq] status=${res.status}`);

  if (!res.ok) {
    console.error(`[Groq] ${raw.slice(0, 700)}`);
    throw new Error(`Groq request failed (${res.status}).`);
  }

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Groq returned invalid JSON.");
  }

  const reply = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!reply) throw new Error("Groq returned an empty response.");

  return reply;
}

/* ========================= CLAUDE TEXT ========================= */

async function callClaudeText(message: string, key: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content: message }],
    }),
  });

  const raw = await res.text();

  console.log(`[Claude] Text status=${res.status}`);

  if (!res.ok) {
    console.error(`[Claude] ${raw.slice(0, 700)}`);
    throw new Error(`Claude request failed (${res.status}).`);
  }

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Claude returned invalid JSON.");
  }

  const reply =
    data?.content
      ?.filter((x: any) => x?.type === "text")
      ?.map((x: any) => x?.text || "")
      ?.join("\n")
      ?.trim() || "";

  if (!reply) throw new Error("Claude returned an empty response.");

  return reply;
}

/* ========================= GEMINI TEXT ========================= */

async function callGeminiText(
  message: string,
  key: string,
): Promise<{ reply: string; model: string }> {
  let lastError = "";

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${SYSTEM_INSTRUCTION}\n\nUser: ${message}`,
                  },
                ],
              },
            ],
          }),
        },
      );

      const raw = await res.text();

      console.log(`[Gemini] Text model=${model} status=${res.status}`);

      if (!res.ok) {
        lastError = raw.slice(0, 500);
        continue;
      }

      let data: any;

      try {
        data = JSON.parse(raw);
      } catch {
        lastError = "Invalid JSON response.";
        continue;
      }

      const reply =
        data?.candidates?.[0]?.content?.parts
          ?.map((x: any) => x?.text || "")
          ?.join("")
          ?.trim() || "";

      if (reply) return { reply, model };

      lastError = "Empty response.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Gemini text failed: ${lastError.slice(0, 150)}`);
}

/* ========================= CLAUDE VISION ========================= */

async function callClaudeVision(
  message: string,
  imageUrl: string,
  key: string,
): Promise<{ reply: string; model: string }> {
  const { base64, mediaType } = await fetchImageAsBase64(imageUrl);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM_INSTRUCTION,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text:
                message ||
                "Describe this image and explain anything important Nexora should know about it.",
            },
          ],
        },
      ],
    }),
  });

  const raw = await res.text();

  console.log(`[Claude] Vision status=${res.status}`);

  if (!res.ok) {
    console.error(`[Claude Vision] ${raw.slice(0, 700)}`);
    throw new Error(`Claude vision failed (${res.status}).`);
  }

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Claude vision returned invalid JSON.");
  }

  const reply =
    data?.content
      ?.filter((x: any) => x?.type === "text")
      ?.map((x: any) => x?.text || "")
      ?.join("\n")
      ?.trim() || "";

  if (!reply) throw new Error("Claude vision returned an empty response.");

  return { reply, model: CLAUDE_MODEL };
}

/* ========================= GEMINI VISION ========================= */

async function callGeminiVision(
  message: string,
  imageUrl: string,
  key: string,
): Promise<{ reply: string; model: string }> {
  const { base64, mediaType } = await fetchImageAsBase64(imageUrl);

  let lastError = "";

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${SYSTEM_INSTRUCTION}\n\nUser: ${
                      message || "Describe this image."
                    }`,
                  },
                  {
                    inlineData: {
                      mimeType: mediaType,
                      data: base64,
                    },
                  },
                ],
              },
            ],
          }),
        },
      );

      const raw = await res.text();

      console.log(`[Gemini] Vision model=${model} status=${res.status}`);

      if (!res.ok) {
        lastError = raw.slice(0, 500);
        continue;
      }

      let data: any;

      try {
        data = JSON.parse(raw);
      } catch {
        lastError = "Invalid JSON response.";
        continue;
      }

      const reply =
        data?.candidates?.[0]?.content?.parts
          ?.map((x: any) => x?.text || "")
          ?.join("")
          ?.trim() || "";

      if (reply) return { reply, model };

      lastError = "Empty response.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Gemini vision failed: ${lastError.slice(0, 150)}`);
}

/* ========================= MAIN ========================= */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        message: "Method not allowed.",
      },
      405,
    );
  }

  try {
    const body = await req.json();

    const message =
      typeof body?.message === "string"
        ? body.message.trim()
        : "";

    const imageUrl =
      typeof body?.imageUrl === "string" &&
      body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;

    if (!message && !imageUrl) {
      return json(
        {
          success: false,
          message: "No message provided.",
        },
        400,
      );
    }

    if (message.length > 10000) {
      return json(
        {
          success: false,
          message: "Message is too long.",
        },
        400,
      );
    }

    console.log(
      `[NEXORA AI] image=${Boolean(imageUrl)} text=${Boolean(message)}`,
    );

    /* =========================================================
       IMAGE: GEMINI → CLAUDE
       ========================================================= */

    if (imageUrl) {
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");

      if (geminiKey) {
        try {
          const result = await callGeminiVision(
            message,
            imageUrl,
            geminiKey,
          );

          return json({
            success: true,
            reply: result.reply,
            model: result.model,
            provider: "gemini",
          });
        } catch (err) {
          console.error(
            "[NEXORA AI] Gemini vision failed; trying Claude.",
            err,
          );
        }
      } else {
        console.warn("GEMINI_API_KEY is not configured.");
      }

      if (claudeKey) {
        try {
          const result = await callClaudeVision(
            message,
            imageUrl,
            claudeKey,
          );

          return json({
            success: true,
            reply: result.reply,
            model: result.model,
            provider: "claude",
          });
        } catch (err) {
          console.error(
            "[NEXORA AI] Claude vision failed.",
            err,
          );
        }
      } else {
        console.warn("ANTHROPIC_API_KEY is not configured.");
      }

      return json(
        {
          success: false,
          message: "All available image-analysis services failed.",
        },
        502,
      );
    }

    /* =========================================================
       TEXT: GROQ → CLAUDE → GEMINI
       ========================================================= */

    const groqKey = Deno.env.get("GROQ_API_KEY");
    const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    /* ---------------- GROQ FIRST ---------------- */

    if (groqKey) {
      try {
        const reply = await callGroqText(message, groqKey);

        return json({
          success: true,
          reply,
          model: GROQ_MODEL,
          provider: "groq",
        });
      } catch (err) {
        console.error(
          "[NEXORA AI] Groq failed; trying Claude.",
          err,
        );
      }
    } else {
      console.warn("GROQ_API_KEY is not configured.");
    }

    /* ---------------- CLAUDE SECOND ---------------- */

    if (claudeKey) {
      try {
        const reply = await callClaudeText(message, claudeKey);

        return json({
          success: true,
          reply,
          model: CLAUDE_MODEL,
          provider: "claude",
        });
      } catch (err) {
        console.error(
          "[NEXORA AI] Claude failed; trying Gemini.",
          err,
        );
      }
    } else {
      console.warn("ANTHROPIC_API_KEY is not configured.");
    }

    /* ---------------- GEMINI THIRD ---------------- */

    if (geminiKey) {
      try {
        const result = await callGeminiText(message, geminiKey);

        return json({
          success: true,
          reply: result.reply,
          model: result.model,
          provider: "gemini",
        });
      } catch (err) {
        console.error(
          "[NEXORA AI] Gemini failed.",
          err,
        );
      }
    } else {
      console.warn("GEMINI_API_KEY is not configured.");
    }

    return json(
      {
        success: false,
        message: "All available AI services failed.",
      },
      502,
    );
  } catch (error) {
    console.error("[NEXORA AI] Unexpected error:", error);

    return json(
      {
        success: false,
        message: "An unexpected error occurred.",
      },
      500,
    );
  }
});