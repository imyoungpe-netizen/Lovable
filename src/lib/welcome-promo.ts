export function getDarkAceWelcomeStorageKeys(telegramUserId: string) {
  const safeId = encodeURIComponent(telegramUserId);
  const prefix = `dark-ace-welcome-v1:${safeId}`;
  return {
    pending: `${prefix}:pending`,
    dismissed: `${prefix}:dismissed`,
  };
}
