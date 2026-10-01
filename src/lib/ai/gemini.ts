import "server-only";

// Google Gemini over REST (generateContent), free tier. No SDK: one small fetch keeps the bundle lean.
//   GEMINI_API_KEY  free key from Google AI Studio (aistudio.google.com/apikey)
//   GEMINI_MODEL    optional first choice; defaults to gemini-3.5-flash, falling back to
//                   gemini-3.5-flash-lite when the free tier is overloaded (both free of charge)
// Free-tier content may be used by Google to improve its products, so callers send aggregates and
// customer codes only, never names, phone numbers, emails or addresses.

export const geminiEnabled = () => !!process.env.GEMINI_API_KEY;
export const geminiModels = () => [...new Set([process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-3.5-flash-lite"])];
export const geminiModel = () => geminiModels()[0];

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

class GeminiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function callModel(model: string, body: Record<string, unknown>, timeoutMs: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Timed out or network blip: a slow model is better retried on the faster fallback.
    throw new GeminiError(`Gemini ${model}: ${err instanceof Error ? err.message : err}`, true);
  }
  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    // Overloaded / rate-limited / gone: worth trying again or another model.
    const retryable = [429, 500, 503, 504, 404].includes(res.status);
    throw new GeminiError(`Gemini ${model} ${res.status}: ${json.error?.status ?? ""} ${json.error?.message ?? ""}`.trim(), retryable);
  }
  if (json.promptFeedback?.blockReason) throw new GeminiError(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`, false);
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) throw new GeminiError(`Gemini ${model} returned no text (${json.candidates?.[0]?.finishReason ?? "unknown"})`, true);
  return text;
}

/** Tries each free model in turn (one quick retry on overload). Returns the text and the model that answered. */
async function generate(body: Record<string, unknown>, timeoutMs: number): Promise<{ text: string; model: string }> {
  let last: unknown;
  for (const model of geminiModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { text: await callModel(model, body, timeoutMs), model };
      } catch (err) {
        last = err;
        if (!(err instanceof GeminiError) || !err.retryable) throw err;
        if (/aborted|timeout/i.test(err.message)) break; // don't wait twice on a slow model: move on
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  throw last instanceof Error ? last : new Error("Gemini unavailable");
}

/** Structured answer that must match `schema` (OpenAPI-style Gemini schema). */
export async function geminiJson<T>(o: { system: string; prompt: string; schema: object; temperature?: number; timeoutMs?: number }): Promise<{ data: T; model: string }> {
  const { text, model } = await generate(
    {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: o.schema, temperature: o.temperature ?? 0.4 },
    },
    o.timeoutMs ?? 30_000,
  );
  return { data: JSON.parse(text) as T, model };
}

/** Plain-text answer. */
export async function geminiText(o: { system: string; prompt: string; temperature?: number; timeoutMs?: number }): Promise<{ text: string; model: string }> {
  return generate(
    {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      generationConfig: { temperature: o.temperature ?? 0.3 },
    },
    o.timeoutMs ?? 20_000,
  );
}
