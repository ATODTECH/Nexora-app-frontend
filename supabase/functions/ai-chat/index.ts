import { serve } from "https://deno.land/std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_MODEL =
  Deno.env.get("GROQ_TEXT_MODEL") || "openai/gpt-oss-20b";

const CLAUDE_MODEL =
  Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5";

const AI_PROVIDER =
  (Deno.env.get("AI_PROVIDER") || "claude").trim().toLowerCase();

const GEMINI_MODELS = (
  Deno.env.get("GEMINI_VISION_MODELS") ||
  "gemini-3.6-flash,gemini-3.5-flash"
)
  .split(",")
  .map((m) => m.trim())
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
- Explain technical concepts in simple language.
- Ask a concise clarification question when important information is missing.

Do not claim to have access to business data, documents, customers, orders, finances, or other private information unless that information has actually been provided to you through the application.

When business context is provided, use it carefully and prioritize the provided information.

If the user provides an image, carefully inspect it and describe only what can reasonably be determined from the image.
`;

const json = (
  body: Record<string, unknown>,
  status = 200
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

/* ============================================================
   UTILITIES
   ============================================================ */

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
  }

  return btoa(binary);
}

async function fetchImageAsBase64(
  imageUrl: string
): Promise<{
  base64: string;
  mediaType: string;
}> {
  const imageRes = await fetch(imageUrl);

  if (!imageRes.ok) {
    const errorBody = await imageRes.text();

    console.error(
      `[Image] Fetch failed [${imageRes.status}]:`,
      errorBody.slice(0, 300)
    );

    throw new Error(
      `Could not fetch the uploaded image (HTTP ${imageRes.status}).`
    );
  }

  const contentType =
    imageRes.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    const bodyPreview = await imageRes.text();

    console.error(
      `[Image] URL did not return an image. content-type="${contentType}" body:`,
      bodyPreview.slice(0, 300)
    );

    throw new Error(
      "The uploaded file link did not return an image. It may have expired or failed to upload correctly."
    );
  }

  const imageBuffer = await imageRes.arrayBuffer();

  /*
   * Claude API image requests should remain reasonably sized.
   * 5 MB keeps the request comfortably within normal image limits.
   */
  if (imageBuffer.byteLength > 5 * 1024 * 1024) {
    throw new Error(
      "The uploaded image is too large. Please choose an image smaller than 5 MB."
    );
  }

  const base64 = arrayBufferToBase64(imageBuffer);

  console.log(
    `[Image] Loaded image: ${contentType}, ${imageBuffer.byteLength} bytes`
  );

  return {
    base64,
    mediaType: contentType,
  };
}

/* ============================================================
   CLAUDE TEXT
   ============================================================ */

async function callClaudeText(
  message: string,
  apiKey: string
): Promise<string> {
  const claudeRes = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: SYSTEM_INSTRUCTION,
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
      }),
    }
  );

  const responseText = await claudeRes.text();

  console.log(
    `[Claude] Text response status: ${claudeRes.status}`
  );

  if (!claudeRes.ok) {
    console.error(
      `[Claude] API error [${claudeRes.status}]:`,
      responseText.slice(0, 1000)
    );

    throw new Error(
      "Unable to get a response from Claude."
    );
  }

  let claudeData: any;

  try {
    claudeData = JSON.parse(responseText);
  } catch {
    console.error(
      "[Claude] Invalid JSON response:",
      responseText.slice(0, 500)
    );

    throw new Error(
      "Claude returned an invalid response."
    );
  }

  const reply =
    claudeData?.content
      ?.filter((block: any) => block?.type === "text")
      ?.map((block: any) => block?.text || "")
      ?.join("\n")
      ?.trim() || "";

  if (!reply) {
    console.error(
      "[Claude] Empty response:",
      JSON.stringify(claudeData).slice(0, 1000)
    );

    throw new Error(
      "Claude returned an empty response."
    );
  }

  return reply;
}

/* ============================================================
   CLAUDE VISION
   ============================================================ */

async function callClaudeVision(
  message: string,
  imageUrl: string,
  apiKey: string
): Promise<{
  reply: string;
  model: string;
}> {
  const {
    base64,
    mediaType,
  } = await fetchImageAsBase64(imageUrl);

  const claudeRes = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
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
                  "Describe this image and explain anything important that Nexora should know about it.",
              },
            ],
          },
        ],
      }),
    }
  );

  const responseText = await claudeRes.text();

  console.log(
    `[Claude] Vision response status: ${claudeRes.status}`
  );

  if (!claudeRes.ok) {
    console.error(
      `[Claude] Vision API error [${claudeRes.status}]:`,
      responseText.slice(0, 1000)
    );

    throw new Error(
      "Unable to analyze the image with Claude."
    );
  }

  let claudeData: any;

  try {
    claudeData = JSON.parse(responseText);
  } catch {
    console.error(
      "[Claude] Invalid vision JSON:",
      responseText.slice(0, 500)
    );

    throw new Error(
      "Claude returned an invalid image-analysis response."
    );
  }

  const reply =
    claudeData?.content
      ?.filter((block: any) => block?.type === "text")
      ?.map((block: any) => block?.text || "")
      ?.join("\n")
      ?.trim() || "";

  if (!reply) {
    throw new Error(
      "Claude returned an empty image-analysis response."
    );
  }

  return {
    reply,
    model: CLAUDE_MODEL,
  };
}

/* ============================================================
   GROQ TEXT
   ============================================================ */

async function callGroqText(
  message: string,
  apiKey: string
): Promise<string> {
  const groqRes = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_INSTRUCTION,
          },
          {
            role: "user",
            content: message,
          },
        ],
        max_tokens: 2048,
      }),
    }
  );

  const responseText = await groqRes.text();

  if (!groqRes.ok) {
    console.error(
      `Groq API error [${groqRes.status}]:`,
      responseText.slice(0, 1000)
    );

    throw new Error(
      "Unable to get a response from the Groq AI service."
    );
  }

  const groqData = JSON.parse(responseText);

  const reply =
    groqData?.choices?.[0]?.message?.content
      ?.trim() ?? "";

  if (!reply) {
    throw new Error(
      "The Groq AI service returned an empty response."
    );
  }

  return reply;
}

/* ============================================================
   GEMINI VISION — EXISTING FALLBACK/PREVIOUS IMAGE SYSTEM
   ============================================================ */

async function callGeminiVision(
  message: string,
  imageUrl: string,
  geminiKey: string
): Promise<{
  reply: string;
  model: string;
}> {
  const {
    base64,
    mediaType,
  } = await fetchImageAsBase64(imageUrl);

  console.log(
    `[Gemini] Sending image: contentType=${mediaType}, base64Length=${base64.length}`
  );

  let lastError = "";

  for (const candidateModel of GEMINI_MODELS) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
        }
      );

      const responseText = await geminiRes.text();

      console.log(
        `[Gemini] Model ${candidateModel} response status: ${geminiRes.status}`
      );

      if (!geminiRes.ok) {
        lastError = responseText;

        console.error(
          `Gemini API error [${geminiRes.status}] for model ${candidateModel}:`,
          responseText.slice(0, 500)
        );

        continue;
      }

      const geminiData = JSON.parse(responseText);

      const reply =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
          ?.trim() ?? "";

      if (reply) {
        return {
          reply,
          model: candidateModel,
        };
      }

      lastError = "Empty response";
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.message
          : String(err);

      console.error(
        `Gemini request threw for model ${candidateModel}:`,
        lastError
      );
    }
  }

  throw new Error(
    `Unable to analyze that image right now. (${lastError.slice(
      0,
      150
    )})`
  );
}

/* ============================================================
   MAIN EDGE FUNCTION
   ============================================================ */

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
      405
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
      body.imageUrl.length > 0
        ? body.imageUrl
        : null;

    if (!message && !imageUrl) {
      return json(
        {
          success: false,
          message: "No message provided.",
        },
        400
      );
    }

    if (message.length > 10000) {
      return json(
        {
          success: false,
          message: "Message is too long.",
        },
        400
      );
    }

    console.log(
      `[NEXORA AI] provider=${AI_PROVIDER}, image=${Boolean(
        imageUrl
      )}, model=${
        AI_PROVIDER === "claude"
          ? CLAUDE_MODEL
          : GROQ_MODEL
      }`
    );

    /* ========================================================
       CLAUDE PROVIDER
       ======================================================== */

    if (AI_PROVIDER === "claude") {
      const claudeKey =
        Deno.env.get("ANTHROPIC_API_KEY");

      if (!claudeKey) {
        console.error(
          "ANTHROPIC_API_KEY is not configured."
        );

        return json(
          {
            success: false,
            message:
              "Claude AI service is not configured.",
          },
          500
        );
      }

      try {
        if (imageUrl) {
          const {
            reply,
            model,
          } = await callClaudeVision(
            message,
            imageUrl,
            claudeKey
          );

          return json({
            success: true,
            reply,
            model,
            provider: "claude",
          });
        }

        const reply =
          await callClaudeText(
            message,
            claudeKey
          );

        return json({
          success: true,
          reply,
          model: CLAUDE_MODEL,
          provider: "claude",
        });
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : String(err);

        console.error(
          "Claude request failed:",
          errMsg
        );

        return json(
          {
            success: false,
            message: errMsg,
            error: errMsg,
            provider: "claude",
          },
          502
        );
      }
    }

    /* ========================================================
       GROQ PROVIDER
       ======================================================== */

    if (AI_PROVIDER === "groq") {
      if (imageUrl) {
        const geminiKey =
          Deno.env.get("GEMINI_API_KEY");

        if (!geminiKey) {
          console.error(
            "GEMINI_API_KEY is not configured."
          );

          return json(
            {
              success: false,
              message:
                "Image analysis is not configured.",
            },
            500
          );
        }

        try {
          const {
            reply,
            model,
          } = await callGeminiVision(
            message,
            imageUrl,
            geminiKey
          );

          return json({
            success: true,
            reply,
            model,
            provider: "gemini",
          });
        } catch (err) {
          const errMsg =
            err instanceof Error
              ? err.message
              : String(err);

          console.error(
            "Gemini vision failed:",
            errMsg
          );

          return json(
            {
              success: false,
              message: errMsg,
              error: errMsg,
              provider: "gemini",
            },
            502
          );
        }
      }

      const groqKey =
        Deno.env.get("GROQ_API_KEY");

      if (!groqKey) {
        console.error(
          "GROQ_API_KEY is not configured."
        );

        return json(
          {
            success: false,
            message:
              "Groq AI service is not configured.",
          },
          500
        );
      }

      try {
        const reply =
          await callGroqText(
            message,
            groqKey
          );

        return json({
          success: true,
          reply,
          model: GROQ_MODEL,
          provider: "groq",
        });
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : String(err);

        console.error(
          "Groq text failed:",
          errMsg
        );

        return json(
          {
            success: false,
            message: errMsg,
            error: errMsg,
            provider: "groq",
          },
          502
        );
      }
    }

    /* ========================================================
       INVALID PROVIDER
       ======================================================== */

    return json(
      {
        success: false,
        message:
          `Invalid AI_PROVIDER "${AI_PROVIDER}". ` +
          `Use "claude" or "groq".`,
      },
      400
    );
  } catch (error) {
    console.error(
      "AI chat error:",
      error
    );

    return json(
      {
        success: false,
        message:
          "An unexpected error occurred.",
      },
      500
    );
  }
});