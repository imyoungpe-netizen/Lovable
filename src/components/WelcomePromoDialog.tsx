import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Ticket } from "lucide-react";
import "./WelcomePromoDialog.css";

type WelcomePromoDialogProps = {
  open: boolean;
  playerName: string;
  onOpenChange: (open: boolean) => void;
  onRedeem: () => void;
};

export default function WelcomePromoDialog({
  open,
  playerName,
  onOpenChange,
  onRedeem,
}: WelcomePromoDialogProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="da-welcome-overlay" />
      <Dialog.Content className="da-welcome-dialog" data-testid="dialog-first-visit-welcome">
        <div className="da-welcome-mark"><Ticket size={18} aria-hidden="true" /></div>
        <span className="da-welcome-eyebrow">DARK ACE · ПРИВЕТСТВИЕ</span>
        <Dialog.Title className="da-welcome-title">Добро пожаловать, {playerName}!</Dialog.Title>
        <Dialog.Description className="da-welcome-description">
          DARK ACE — мини-приложение в Telegram, связанное с «Дурак Онлайн». Выбери игру и ставку; баланс и историю смотри в профиле.
        </Dialog.Description>
        <div className="da-welcome-promo">
          <span>ПРОМОКОД ДРУГА</span>
          <p>
            Введи код от друга или клуба, чтобы получить бонус до 25 000 кредитов по условиям промокода.
          </p>
        </div>
        <button type="button" className="da-welcome-action" onClick={onRedeem} data-testid="button-welcome-enter-promo">
          <Ticket size={17} aria-hidden="true" />
          Ввести промокод
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <span className="da-welcome-footnote">Код не подставляется автоматически, чтобы ты мог ввести промокод друга.</span>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
