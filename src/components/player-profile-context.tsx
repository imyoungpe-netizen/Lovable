import { createContext, useContext, type MouseEvent, type ReactNode } from "react";

const publicUserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type OpenProfile = (publicUserId: string) => void;

const PlayerProfileContext = createContext<OpenProfile | null>(null);

export function useOpenPlayerProfile() {
  return useContext(PlayerProfileContext);
}

export const PlayerProfileContextProvider = PlayerProfileContext.Provider;

export function isPublicPlayerId(value: string | null | undefined): value is string {
  return typeof value === "string" && publicUserIdPattern.test(value);
}

export function PlayerAvatar({
  publicUserId,
  displayName,
  avatarUrl,
  avatarClassName,
  children,
}: {
  publicUserId?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  avatarClassName: string;
  children?: ReactNode;
}) {
  const openProfile = useOpenPlayerProfile();
  const isClickable = isPublicPlayerId(publicUserId) && openProfile !== null;
  const face = <span className={avatarClassName} title={isClickable ? undefined : displayName} aria-hidden={isClickable || undefined}>
    {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.trim().slice(0, 1).toUpperCase() || "A"}
    {children}
  </span>;

  if (!isClickable || !publicUserId || !openProfile) return face;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openProfile(publicUserId);
  };

  return <button
    type="button"
    className="player-avatar-trigger"
    onClick={handleClick}
    aria-label={`Открыть профиль игрока ${displayName}`}
    title={`Профиль: ${displayName}`}
    data-testid={`button-open-player-profile-${publicUserId}`}
    data-public-player-id={publicUserId}
  >
    {face}
  </button>;
}
