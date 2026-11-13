import { ChevronDown, Coins, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDarkAceBotUrl, openDarkAceBotUrl } from "./telegram-bot-links";
import "./GameChrome.css";

const balanceFormat = new Intl.NumberFormat("ru-RU");
type PopoverPosition = { top: number; left: number; width: number };

type GameBalanceProps = {
  balance?: number;
  topupBotUrl?: string | null;
  align?: "left" | "right";
  className?: string;
  onRetry?: () => void;
};

export function GameBalance({ balance, topupBotUrl, align = "left", className = "", onRetry }: GameBalanceProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const formatted = balance === undefined || balance === null ? "—" : balanceFormat.format(balance);
  const topupUrl = getDarkAceBotUrl(topupBotUrl, "da_topup");
  const withdrawalUrl = getDarkAceBotUrl(topupBotUrl, "da_withdraw");

  useEffect(() => {
    if (!open) return;
    const updatePopoverPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(218, Math.max(160, window.innerWidth - 24));
      const minLeft = 12;
      const maxLeft = Math.max(minLeft, window.innerWidth - width - 12);
      const desiredLeft = align === "right" ? rect.right - width : rect.left;
      const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      const estimatedHeight = 190;
      const opensAbove = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
      const desiredTop = opensAbove ? rect.top - estimatedHeight - 7 : rect.bottom + 7;
      const top = Math.max(12, Math.min(window.innerHeight - estimatedHeight - 12, desiredTop));
      setPosition({ top, left, width });
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    updatePopoverPosition();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", updatePopoverPosition, true);
    window.addEventListener("resize", updatePopoverPosition);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", updatePopoverPosition, true);
      window.removeEventListener("resize", updatePopoverPosition);
    };
  }, [open, align]);

  const close = () => setOpen(false);
  const menu = open && position && (
    <div
      ref={popoverRef}
      id={menuId}
      className="game-wallet-popover"
      role="menu"
      aria-label="Операции с балансом"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div className="game-wallet-total">
        <span>Доступный баланс</span>
        <strong>{formatted} кредитов</strong>
      </div>
      <a href={topupUrl ?? undefined} role="menuitem" aria-disabled={!topupUrl} onClick={(event) => {
        event.preventDefault();
        close();
        openDarkAceBotUrl(topupUrl);
      }}>
        <ArrowDownToLine size={16} aria-hidden="true" />
        <span>Пополнить</span>
      </a>
      <a href={withdrawalUrl ?? undefined} role="menuitem" aria-disabled={!withdrawalUrl} onClick={(event) => {
        event.preventDefault();
        close();
        openDarkAceBotUrl(withdrawalUrl);
      }}>
        <ArrowUpFromLine size={16} aria-hidden="true" />
        <span>Вывести</span>
      </a>
      {onRetry && (
        <button type="button" role="menuitem" onClick={() => { close(); onRetry(); }}>
          <Coins size={16} aria-hidden="true" />
          <span>Обновить баланс</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <div ref={menuRef} className={`game-wallet-menu ${align === "right" ? "is-align-right" : ""} ${className}`.trim()}>
        <button
          ref={triggerRef}
          type="button"
          className="game-balance"
          aria-label={`Баланс ${formatted} кредитов. Открыть операции`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
          data-testid="button-game-wallet"
        >
          <Coins className="game-balance-icon" size={18} aria-hidden="true" />
          <span className="game-balance-copy">
            <small>БАЛАНС</small>
            <b>{formatted}<i>кр.</i></b>
          </span>
          <ChevronDown className={`game-balance-chevron ${open ? "is-open" : ""}`} size={15} aria-hidden="true" />
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
