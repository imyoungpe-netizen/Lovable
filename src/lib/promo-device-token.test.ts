import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreatePromoDeviceToken } from "./promo-device-token.js";

test("promo installation token is stable per storage and is a UUID", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const cryptoApi = {
    randomUUID: () => "7b2e987d-8f86-4d3b-a354-3a1273b12e3f",
    getRandomValues: <T extends ArrayBufferView | null>(array: T) => array,
  } as Crypto;

  const first = getOrCreatePromoDeviceToken(storage, cryptoApi);
  const second = getOrCreatePromoDeviceToken(storage, {
    ...cryptoApi,
    randomUUID: () => "d9a1e1a4-ff93-4a6d-a55b-dd7722cbfca0",
  } as Crypto);
  assert.equal(first, "7b2e987d-8f86-4d3b-a354-3a1273b12e3f");
  assert.equal(second, first);
});
