import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import "./StakeChipPicker.css";

export type StakeChipKey = "0.5" | "1" | "2" | "5" | "10" | "25" | "50" | "all-in";
export type StakeChipOption = { id: Exclude<StakeChipKey, "all-in">; percentage: number; amount: number };

const percentages = [0.5, 1, 2, 5, 10, 25, 50] as const;
const credits = new Intl.NumberFormat("ru-RU");
const compactNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const formatCompactCredits = (amount: number) => amount >= 1_000_000
  ? `${compactNumber.format(amount / 1_000_000)} М`
  : amount >= 1_000
    ? `${compactNumber.format(amount / 1_000)} К`
    : credits.format(amount);
const formatPercentage = (percentage: number) => `${compactNumber.format(percentage)}%`;

export function getStakeChipOptions(budget: number, minStake = 100, step = 1): StakeChipOption[] {
  if (!Number.isSafeInteger(budget) || budget < minStake || !Number.isSafeInteger(step) || step <= 0) return [];
  const min = Math.ceil(minStake / step) * step;
  const options: StakeChipOption[] = [];
  const seen = new Set<number>();
  for (const percentage of percentages) {
    const proportional = Math.floor(budget * percentage / 100 / step) * step;
    const amount = Math.max(min, proportional);
    if (amount > budget || seen.has(amount)) continue;
    seen.add(amount);
    options.push({ id: String(percentage) as StakeChipOption["id"], percentage, amount });
  }
  return options;
}

export function getStakeChipAmount(
  key: StakeChipKey,
  options: StakeChipOption[],
  allInAmount: number,
): number {
  if (key === "all-in") return Number.isSafeInteger(allInAmount) ? Math.max(0, allInAmount) : 0;
  return options.find((option) => option.id === key)?.amount ?? 0;
}

type StakeChipPickerProps = {
  budget: number;
  maxStake: number;
  allInAmount?: number;
  minStake?: number;
  step?: number;
  selectedKey: StakeChipKey;
  onSelect(key: StakeChipKey): void;
  disabled?: boolean;
  testIdPrefix: string;
  label?: string;
  className?: string;
  resetKey?: string | number;
};

export function StakeChipPicker({
  budget,
  maxStake,
  allInAmount = maxStake,
  minStake = 100,
  step = 1,
  selectedKey,
  onSelect,
  disabled = false,
  testIdPrefix,
  label = "ВЫБРАНА ФИШКА",
  className = "",
  resetKey,
}: StakeChipPickerProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [resetKey]);
  const options = useMemo(() => getStakeChipOptions(budget, minStake, step), [budget, minStake, step]);
  const selectedOption = options.find((option) => option.id === selectedKey);
  const selectedAmount = getStakeChipAmount(selectedKey, options, allInAmount);
  const pickerId = testIdPrefix.replace(/[^a-z0-9_-]/gi, "-");

  useEffect(() => {
    if (selectedKey !== "all-in" && options.length > 0 && !selectedOption) {
      onSelect(options[0]!.id);
    }
  }, [onSelect, options, selectedKey, selectedOption]);

  return (
    <div className={`stake-chip-picker ${className}`.trim()} data-stake-chip-source data-stake-chip-amount={selectedAmount}>
      <button
        type="button"
        className={`stake-chip-selected${selectedKey === "all-in" ? " is-all-in" : ""}`}
        aria-label={`${selectedKey === "all-in" ? "Алл-ин" : `Фишка ${formatPercentage(selectedOption?.percentage ?? 1)}`}: ${credits.format(selectedAmount)} кредитов`}
        aria-expanded={open}
        aria-controls={`${pickerId}-tray`}
        data-testid={`${testIdPrefix}-selector`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Coins size={19} aria-hidden="true" />
        <span>
          <small>{selectedKey === "all-in" ? "АЛЛ-ИН" : label}</small>
          <b>{selectedAmount >= minStake ? credits.format(selectedAmount) : "—"}</b>
          <small>кредитов</small>
        </span>
        <ChevronDown className={open ? "is-open" : ""} size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="stake-chip-tray" id={`${pickerId}-tray`} role="group" aria-label="Выберите размер фишки">
          {options.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`stake-chip-option${selectedKey === option.id ? " is-selected" : ""}`}
              disabled={disabled || option.amount > maxStake}
              onClick={() => { onSelect(option.id); setOpen(false); }}
              aria-label={`${formatPercentage(option.percentage)} баланса: ${credits.format(option.amount)} кредитов`}
              aria-pressed={selectedKey === option.id}
              data-testid={`${testIdPrefix}-${option.id}`}
            >
              <span className="stake-chip-coin" aria-hidden="true"><Coins size={15} /></span>
              <b>{formatCompactCredits(option.amount)}</b>
            </button>
          ))}
          <button
            type="button"
            className={`stake-chip-option stake-chip-all-in${selectedKey === "all-in" ? " is-selected" : ""}`}
            disabled={disabled || maxStake < minStake}
            onClick={() => { onSelect("all-in"); setOpen(false); }}
            aria-label={`Алл-ин: ${allInAmount >= minStake ? credits.format(allInAmount) : "недоступно"} кредитов`}
            aria-pressed={selectedKey === "all-in"}
            data-testid={`${testIdPrefix}-all-in`}
          >
            <span className="stake-chip-coin" aria-hidden="true"><Coins size={15} /></span>
            <b>АЛЛ-ИН</b>
            <small>{allInAmount >= minStake ? formatCompactCredits(allInAmount) : "—"}</small>
          </button>
        </div>
      )}
    </div>
  );
}
