import "server-only";

// Google Gemini over REST (generateContent), free tier. No SDK: one small fetch keeps the bundle lean.
//   GEMINI_API_KEY  free key from Google AI Studio (aistudio.google.com/apikey)
//   GEMINI_MODEL    optional, defaults to gemini-3.5-flash (free of charge)
// Free-tier content may be used by Google to improve its products, so callers send aggregates and
// customer codes only, never names, phone numbers, emails or addresses.

export const geminiEnabled = () => !!process.env.GEMINI_API_KEY;
export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

async function generate(body: Record<string, unknown>, timeoutMs: number): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.status ?? ""} ${json.error?.message ?? ""}`.trim());
  if (json.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned no text (${json.candidates?.[0]?.finishReason ?? "unknown"})`);
  return text;
}

/** Structured answer that must match `schema` (OpenAPI-style Gemini schema). */
export async function geminiJson<T>(o: { system: string; prompt: string; schema: object; temperature?: number; timeoutMs?: number }): Promise<T> {
  const text = await generate(
    {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: o.schema, temperature: o.temperature ?? 0.4 },
    },
    o.timeoutMs ?? 40_000,
  );
  return JSON.parse(text) as T;
}

/** Plain-text answer. */
export async function geminiText(o: { system: string; prompt: string; temperature?: number; timeoutMs?: number }): Promise<string> {
  return generate(
    {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.prompt }] }],
      generationConfig: { temperature: o.temperature ?? 0.3 },
    },
    o.timeoutMs ?? 25_000,
  );
}
