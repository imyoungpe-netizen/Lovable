export type RouletteReelOutcome = "red" | "black" | "coins";

export type RouletteReelFrame = {
  symbols: RouletteReelOutcome[];
  targetIndex: number;
  coinIndex: number;
};

export const ROULETTE_REEL_CYCLE_SIZE = 25;
export const ROULETTE_REEL_RED_COUNT = 12;
export const ROULETTE_REEL_BLACK_COUNT = 12;
export const ROULETTE_REEL_COIN_COUNT = 1;
export const ROULETTE_REEL_COPY_COUNT = 8;
export const ROULETTE_REEL_STOP_COPY_INDEX = 6;
export const ROULETTE_REEL_MIN_COIN_PASSES = 2;
export const ROULETTE_REEL_LAUNCH_CYCLES = 2.1;
export const ROULETTE_REEL_DECELERATION_RUNWAY_CYCLES = 2.8;
// Keep the fast launch intact; spend less of the braking phase barely moving.
export const ROULETTE_REEL_BRAKING_EASING = "cubic-bezier(.05,.72,.26,1)";

export function getRouletteReelBrakingProgress(progress: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 12);
}

function hashRound(roundNumber: number): number {
  let value = Math.imul((roundNumber >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

export function getRouletteReelFrame(
  roundNumber: number,
  outcome: RouletteReelOutcome | null,
): RouletteReelFrame {
  if (!Number.isSafeInteger(roundNumber) || roundNumber < 1) {
    throw new RangeError("INVALID_ROULETTE_REEL_ROUND");
  }
  const seed = hashRound(roundNumber);
  const coinIndex = seed % ROULETTE_REEL_CYCLE_SIZE;
  const firstSymbol: "red" | "black" = (seed & 1) === 0 ? "red" : "black";
  const symbols: RouletteReelOutcome[] = [];
  let nonCoinOrdinal = 0;

  for (let index = 0; index < ROULETTE_REEL_CYCLE_SIZE; index += 1) {
    if (index === coinIndex) {
      symbols.push("coins");
      continue;
    }
    symbols.push((nonCoinOrdinal % 2 === 0) === (firstSymbol === "red") ? "red" : "black");
    nonCoinOrdinal += 1;
  }

  const provisionalOutcome: RouletteReelOutcome = (seed & 2) === 0 ? "red" : "black";
  const desiredOutcome = outcome ?? provisionalOutcome;
  const targetSeed = hashRound(roundNumber + (desiredOutcome === "red" ? 0x15 : desiredOutcome === "black" ? 0x2b : 0x3d));
  let targetIndex: number;
  if (desiredOutcome === "coins") {
    targetIndex = coinIndex;
  } else {
    const candidates = symbols.flatMap((symbol, index) => {
      const circularDistance = Math.min(
        Math.abs(index - coinIndex),
        ROULETTE_REEL_CYCLE_SIZE - Math.abs(index - coinIndex),
      );
      return symbol === desiredOutcome && circularDistance > 2 ? [index] : [];
    });
    if (!candidates.length) throw new Error("ROULETTE_REEL_NO_SAFE_RESULT_CELL");
    targetIndex = candidates[targetSeed % candidates.length]!;
  }

  return { symbols, targetIndex, coinIndex };
}

export function getRouletteReelMotionPlan(
  startX: number,
  endX: number,
  cycleDistance: number,
  durationMs: number,
): {
  accelerationEndX: number;
  launchEndX: number;
  accelerationMs: number;
  launchMs: number;
} {
  if (
    !Number.isFinite(startX)
    || !Number.isFinite(endX)
    || !Number.isFinite(cycleDistance)
    || cycleDistance <= 0
    || !Number.isFinite(durationMs)
    || durationMs <= 0
  ) {
    throw new RangeError("INVALID_ROULETTE_REEL_MOTION");
  }
  const direction = endX < startX ? -1 : 1;
  const distance = Math.abs(endX - startX);
  const launchDistance = Math.min(
    cycleDistance * ROULETTE_REEL_LAUNCH_CYCLES,
    Math.max(0, distance - cycleDistance * ROULETTE_REEL_DECELERATION_RUNWAY_CYCLES),
  );
  const accelerationDistance = Math.min(cycleDistance * 0.25, launchDistance * 0.12);
  const accelerationMs = Math.min(160, durationMs * 0.05);
  const launchMs = Math.min(900, durationMs * 0.2);

  return {
    accelerationEndX: startX + direction * accelerationDistance,
    launchEndX: startX + direction * launchDistance,
    accelerationMs,
    launchMs,
  };
}

export function getRouletteReelLandingFraction(stopPosition: number | null): number {
  const safePosition = Number.isFinite(stopPosition) ? stopPosition as number : 0.5;
  return 0.16 + Math.max(0, Math.min(1, safePosition)) * 0.68;
}
