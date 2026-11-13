export type DarkAceBotStartPayload = "da_topup" | "da_withdraw";

export function getDarkAceBotUrl(
  topupBotUrl: string | null | undefined,
  startPayload: DarkAceBotStartPayload,
): string | null {
  if (!topupBotUrl) return null;
  try {
    const url = new URL(topupBotUrl);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "t.me"
      || !/^\/[A-Za-z0-9_]+$/.test(url.pathname)
      || url.searchParams.get("start") !== "da_topup") return null;
    url.searchParams.set("start", startPayload);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function openDarkAceBotUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const telegram = (window as Window & {
    Telegram?: { WebApp?: { openTelegramLink?: (value: string) => void; close?: () => void } };
  }).Telegram?.WebApp;
  if (telegram?.openTelegramLink) {
    telegram.openTelegramLink(url);
    window.setTimeout(() => telegram.close?.(), 180);
    return true;
  }
  window.location.assign(url);
  return true;
}
