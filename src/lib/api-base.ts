const apiBaseUrl = (import.meta.env.VITE_DARK_ACE_API_URL || "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export function darkAceWebSocketUrl(): string {
  const base = apiBaseUrl || window.location.origin;
  const websocketBase = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${websocketBase}/api/dark-ace/live`;
}
