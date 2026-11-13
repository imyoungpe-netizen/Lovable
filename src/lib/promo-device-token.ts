const STORAGE_KEY = "dark-ace-promo-device-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TokenStorage = Pick<Storage, "getItem" | "setItem">;

function createUuid(cryptoApi: Crypto): string {
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrCreatePromoDeviceToken(
  storage: TokenStorage,
  cryptoApi: Crypto,
): string {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored && UUID_PATTERN.test(stored)) return stored;
  const token = createUuid(cryptoApi);
  storage.setItem(STORAGE_KEY, token);
  return token;
}

export function getPromoDeviceToken(): string | undefined {
  try {
    return getOrCreatePromoDeviceToken(window.localStorage, window.crypto);
  } catch {
    // Storage can be disabled in private or restricted Telegram webviews.
    return undefined;
  }
}
