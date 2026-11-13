const ruNumber = new Intl.NumberFormat("ru-RU");

export function getRussianCreditWord(value: number): string {
  const amount = Math.abs(Math.trunc(value));
  const lastTwoDigits = amount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "кредитов";

  switch (amount % 10) {
    case 1:
      return "кредит";
    case 2:
    case 3:
    case 4:
      return "кредита";
    default:
      return "кредитов";
  }
}

export function formatCredits(value: number): string {
  return `${ruNumber.format(value)} ${getRussianCreditWord(value)}`;
}

const amountWithCurrencyPattern =
  /([+-]?\d(?:[\d\s\u00a0\u202f]*\d)?)\s*(кредит(?:а|ов)?|кр\.?|darkcoins?\s*\(dc\)|dc)(?![\p{L}\p{N}_])/giu;

export function normalizeCurrencyText(value: string): string {
  return value
    .replace(amountWithCurrencyPattern, (match, amountText: string) => {
      const amount = Number(amountText.replace(/[^\d]/g, ""));
      if (!Number.isSafeInteger(amount)) return match;
      return `${amountText.trim()} ${getRussianCreditWord(amount)}`;
    })
    .replace(/\bDarkcoins?\s*\(DC\)|\bDC\b/giu, "кредитов")
    .replace(/(^|[^\p{L}\p{N}_])кр\.?(?!\p{L})/giu, "$1кредитов");
}
