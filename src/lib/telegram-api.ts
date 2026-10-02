import "server-only";

// Minimal Telegram Bot API client (https://core.telegram.org/bots/api). Sends only — the customer bot
// is polled by the basket, so this never reads its updates; the driver bot receives updates by webhook.

export type InlineButton = { text: string; url: string } | { text: string; callback_data: string } | { text: string; web_app: { url: string } };
export type ReplyKeyboard = {
  keyboard: { text: string; request_location?: boolean; request_contact?: boolean }[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
};

// The bot token is part of every Bot API URL. A failed fetch can carry the request in its error, so network
// failures are rethrown as a plain message: nothing that reaches a log can contain the token.
async function call(token: string, method: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`https://api.telegram.org/bot${token}/${method}`, init);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new Error(`Telegram ${method}: ${timedOut ? "timed out" : "network error"}`);
  }
}

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await call(token, method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result;
}

export function sendMessage(
  token: string,
  chatId: string,
  text: string,
  opts: { inline?: InlineButton[][]; keyboard?: ReplyKeyboard } = {},
) {
  return tg<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: opts.inline ? { inline_keyboard: opts.inline } : opts.keyboard,
  });
}

// A photo (by URL) with an HTML caption, e.g. the bot's welcome banner.
export function sendPhoto(
  token: string,
  chatId: string,
  photoUrl: string,
  caption: string,
  opts: { inline?: InlineButton[][]; keyboard?: ReplyKeyboard } = {},
) {
  return tg<{ message_id: number }>(token, "sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
    reply_markup: opts.inline ? { inline_keyboard: opts.inline } : opts.keyboard,
  });
}

// A file (e.g. an invoice PDF) uploaded with the message, HTML caption.
export async function sendDocument(token: string, chatId: string, bytes: Uint8Array, filename: string, caption: string) {
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  form.set("document", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
  const res = await call(token, "sendDocument", { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`Telegram sendDocument: ${json.description ?? res.status}`);
}

export function sendLocation(token: string, chatId: string, lat: number, lng: number) {
  return tg(token, "sendLocation", { chat_id: chatId, latitude: lat, longitude: lng });
}

export function editMessage(token: string, chatId: string, messageId: number, text: string, inline?: InlineButton[][]) {
  return tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: inline ? { inline_keyboard: inline } : undefined,
  });
}

export function answerCallback(token: string, callbackId: string, text?: string) {
  return tg(token, "answerCallbackQuery", { callback_query_id: callbackId, text });
}

// Telegram HTML mode: escape user-provided text.
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
