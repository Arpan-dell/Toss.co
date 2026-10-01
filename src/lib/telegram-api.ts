import "server-only";

// Minimal Telegram Bot API client (https://core.telegram.org/bots/api). Sends only — the customer bot
// is polled by the basket, so this never reads its updates; the driver bot receives updates by webhook.

export type InlineButton = { text: string; url: string } | { text: string; callback_data: string };
export type ReplyKeyboard = { keyboard: { text: string; request_location?: boolean }[][]; resize_keyboard?: boolean; is_persistent?: boolean };

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
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
