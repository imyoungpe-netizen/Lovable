export type DiceSelection = "less_than_7" | "exactly_7" | "greater_than_7";

const selectionOrder: DiceSelection[] = ["less_than_7", "exactly_7", "greater_than_7"];

export function isDiceSelection(value: unknown): value is DiceSelection {
  return value === "less_than_7" || value === "exactly_7" || value === "greater_than_7";
}

export function isDiceSelectionSet(value: unknown): value is DiceSelection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || !value.every(isDiceSelection)) {
    return false;
  }
  if (new Set(value).size !== value.length) return false;
  if (value.length === 1) return true;
  return value.includes("exactly_7")
    && (value.includes("less_than_7") !== value.includes("greater_than_7"));
}

export function toggleDiceSelection(current: DiceSelection[], clicked: DiceSelection): DiceSelection[] {
  if (current.includes(clicked)) return current.filter((selection) => selection !== clicked);
  if (current.length === 0) return [clicked];
  if (current.length === 1) {
    const existing = current[0]!;
    if (existing === "exactly_7") return selectionOrder.filter((selection) => selection === clicked || selection === existing);
    if (clicked === "exactly_7") return selectionOrder.filter((selection) => selection === existing || selection === clicked);
    return [clicked];
  }
  if (clicked === "exactly_7") return current;
  return selectionOrder.filter((selection) => selection === clicked || selection === "exactly_7");
}

export function getDiceMaximumPerSelection(
  balance: number,
  selectionCount: number,
  roundStakeLimit = 250_000_000,
  step = 100,
): number {
  const count = Math.max(1, Math.min(2, Math.floor(selectionCount)));
  if (!Number.isSafeInteger(balance) || balance <= 0 || !Number.isSafeInteger(step) || step <= 0) return 0;
  return Math.floor(Math.min(balance, roundStakeLimit) / count / step) * step;
}
