import { useCallback, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { PublicProfilePage } from "@/components/ProfileMarketHub";
import { isPublicPlayerId, PlayerProfileContextProvider } from "@/components/player-profile-context";
import "./PlayerProfileOverlay.css";

export function PlayerProfileOverlayProvider({ children }: { children: ReactNode }) {
  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const openProfile = useCallback((id: string) => {
    if (isPublicPlayerId(id)) setPublicUserId(id);
  }, []);

  return <PlayerProfileContextProvider value={openProfile}>
    {children}
    <Dialog.Root open={publicUserId !== null} onOpenChange={(open) => { if (!open) setPublicUserId(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="da-player-profile-overlay" />
        <Dialog.Content className="da-player-profile-dialog" data-testid="dialog-player-profile">
          <Dialog.Title className="sr-only">Публичный профиль игрока</Dialog.Title>
          <Dialog.Description className="sr-only">Профиль открывается поверх текущего экрана.</Dialog.Description>
          {publicUserId && <PublicProfilePage publicUserId={publicUserId} />}
          <Dialog.Close asChild>
            <button type="button" className="da-player-profile-close" aria-label="Закрыть профиль" data-testid="button-close-player-profile">
              <X size={17} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </PlayerProfileContextProvider>;
}
