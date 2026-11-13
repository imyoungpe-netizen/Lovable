export type RouletteOutcome = "red" | "black" | "coins";
export const WHEEL_SPIN_ACCELERATION_EASING = "cubic-bezier(.4,0,.7,.48)";
export const WHEEL_SPIN_EASING = "cubic-bezier(.05,.72,.16,1)";

export function getEuropeanRouletteTouchTarget(
  number: number,
  horizontalNeighbor: number | null = null,
  verticalNeighbor: number | null = null,
  diagonalNeighbor: number | null = null,
): string {
  if (!Number.isInteger(number) || number < 1 || number > 36) return `straight:${number}`;
  if (horizontalNeighbor !== null && verticalNeighbor !== null && diagonalNeighbor !== null) {
    return `corner:${[number, horizontalNeighbor, verticalNeighbor, diagonalNeighbor].sort((a, b) => a - b).join(",")}`;
  }
  if (horizontalNeighbor !== null) return `split:${[number, horizontalNeighbor].sort((a, b) => a - b).join(",")}`;
  if (verticalNeighbor !== null) return `split:${[number, verticalNeighbor].sort((a, b) => a - b).join(",")}`;
  return `straight:${number}`;
}

export function getEuropeanRouletteStopAngles(
  resultIndex: number,
  roundNumber: number,
  pocketCount = 37,
): { wheelAngle: number; ballAngle: number } {
  if (!Number.isInteger(resultIndex) || resultIndex < 0 || resultIndex >= pocketCount
    || !Number.isInteger(roundNumber) || pocketCount < 2) return { wheelAngle: 0, ballAngle: 0 };

  const sectorWidth = 360 / pocketCount;
  let hash = Math.imul((roundNumber >>> 0) ^ Math.imul(resultIndex + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  const pocketOffset = -0.38 + ((hash >>> 1) % 7_601) / 10_000;
  const ballPocket = ((roundNumber % pocketCount) * 17) % pocketCount;
  const ballAngle = normalizeWheelAngle((ballPocket + 0.5) * sectorWidth);
  const wheelAngle = normalizeWheelAngle(
    ballAngle - (resultIndex + 0.5 + pocketOffset) * sectorWidth,
  );
  return { wheelAngle, ballAngle };
}

export function getRemainingSeconds(
  deadlineEpochMs: number | null,
  serverOffsetMs: number,
  clientNowMs: number,
): number {
  if (deadlineEpochMs === null || !Number.isFinite(deadlineEpochMs)) return 0;
  return Math.max(0, Math.ceil((deadlineEpochMs - (clientNowMs + serverOffsetMs)) / 1_000));
}

export function getWheelStopAngle(
  outcome: RouletteOutcome,
  redPercent: number,
  blackPercent: number,
  coinsPercent: number,
  gradientStartDegrees = -1.8,
  sectorPosition = 0.5,
): number {
  const sectors = [
    { outcome: "coins", percent: coinsPercent },
    { outcome: "red", percent: redPercent },
    { outcome: "black", percent: blackPercent },
  ] as const;
  const totalPercent = sectors.reduce((total, sector) => total + Math.max(0, sector.percent), 0);
  if (totalPercent <= 0) return 0;

  let startPercent = 0;
  for (const sector of sectors) {
    const percent = Math.max(0, sector.percent);
    if (sector.outcome === outcome) {
      const safePosition = Math.max(0.025, Math.min(0.975, sectorPosition));
      const stopDegrees = gradientStartDegrees + ((startPercent + percent * safePosition) / totalPercent) * 360;
      return ((-stopDegrees % 360) + 360) % 360;
    }
    startPercent += percent;
  }
  return 0;
}

export function getWheelSpinAngles(
  startAngle: number,
  targetAngle: number,
  fullTurns = 5,
): { endAngle: number } {
  const normalizedStart = ((startAngle % 360) + 360) % 360;
  const normalizedTarget = ((targetAngle % 360) + 360) % 360;
  const finalAlignment = ((normalizedTarget - normalizedStart) % 360 + 360) % 360;
  return {
    endAngle: startAngle + Math.max(1, Math.floor(fullTurns)) * 360 + finalAlignment,
  };
}

export function normalizeWheelAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}
