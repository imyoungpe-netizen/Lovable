const UTC_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseUtcDate(value: string): Date {
  return new Date(UTC_DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);
}
