import { ApiError } from '../lib/ApiError';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  return value;
}

/** Validasi payload langganan Web Push (bentuk dari PushSubscription.toJSON()). */
export function parsePushSubscriptionInput(body: unknown): PushSubscriptionInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  const obj = body as Record<string, unknown>;
  const endpoint = nonEmptyString(obj.endpoint, 'endpoint');

  const keys = obj.keys;
  if (typeof keys !== 'object' || keys === null) {
    throw ApiError.badRequest('Field "keys" wajib diisi');
  }
  const k = keys as Record<string, unknown>;
  const p256dh = nonEmptyString(k.p256dh, 'keys.p256dh');
  const auth = nonEmptyString(k.auth, 'keys.auth');

  return { endpoint, keys: { p256dh, auth } };
}
