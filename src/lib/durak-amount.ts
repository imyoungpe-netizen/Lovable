export const MIN_DURAK_WITHDRAWAL_AMOUNT = 100_000;
export const MAX_DURAK_WITHDRAWAL_AMOUNT = 50_000_000;

export function parseDurakWholeAmount(value: string): number | null {
  const digits = value.trim().replace(/[\s.,\u00a0\u202f]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}
