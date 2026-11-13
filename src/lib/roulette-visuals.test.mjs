import assert from "node:assert/strict";
import test from "node:test";
import {
  getEuropeanRouletteStopAngles,
  getEuropeanRouletteTouchTarget,
  getRemainingSeconds,
  getWheelSpinAngles,
  getWheelStopAngle,
  normalizeWheelAngle,
  WHEEL_SPIN_EASING,
} from "./roulette-visuals.ts";

test("European roulette ball lands in a different wheel position while staying inside the winning pocket", () => {
  const pocketCount = 37;
  const sectorWidth = 360 / pocketCount;
  const resultIndex = 18;
  const ballStops = new Set();

  for (let round = 1; round <= pocketCount; round += 1) {
    const { wheelAngle, ballAngle } = getEuropeanRouletteStopAngles(resultIndex, round, pocketCount);
    const ballScreenAngle = normalizeWheelAngle(-90 + ballAngle);
    const resultPocketCenter = normalizeWheelAngle(-90 + resultIndex * sectorWidth + sectorWidth / 2 + wheelAngle);
    const offset = ((ballScreenAngle - resultPocketCenter + 540) % 360) - 180;
    assert.ok(Math.abs(offset) < sectorWidth * 0.4001, "ball must remain inside the winning pocket");
    ballStops.add(ballAngle.toFixed(5));
  }

  assert.equal(ballStops.size, pocketCount, "the ball should visit every pocket position before repeating");
  assert.deepEqual(getEuropeanRouletteStopAngles(-1, 1, pocketCount), { wheelAngle: 0, ballAngle: 0 });
  assert.deepEqual(getEuropeanRouletteStopAngles(pocketCount, 1, pocketCount), { wheelAngle: 0, ballAngle: 0 });
});

test("roulette inside-touch bets distinguish a single, a two-number split, and a four-number corner", () => {
  assert.equal(getEuropeanRouletteTouchTarget(17), "straight:17");
  assert.equal(getEuropeanRouletteTouchTarget(1, 2), "split:1,2");
  assert.equal(getEuropeanRouletteTouchTarget(1, null, 4), "split:1,4");
  assert.equal(getEuropeanRouletteTouchTarget(1, 2, 4, 5), "corner:1,2,4,5");
});

test("countdown follows server time instead of a decrementing local counter", () => {
  const serverOffset = 420_000;
  const deadline = 1_020_000;
  assert.equal(getRemainingSeconds(deadline, serverOffset, 580_000), 20);
  assert.equal(getRemainingSeconds(deadline, serverOffset, 581_000), 19);
  assert.equal(getRemainingSeconds(deadline, serverOffset, 600_000), 0);
  assert.equal(getRemainingSeconds(null, serverOffset, 500_000), 0);
});

test("all roulette outcomes stop at the center of their actual conic-gradient sector", () => {
  const percentages = { red: 48, black: 48, coins: 4 };
  const expectations = { coins: 5.4, red: 99, black: 271.8 };

  for (const outcome of ["coins", "red", "black"]) {
    const stopAngle = getWheelStopAngle(outcome, percentages.red, percentages.black, percentages.coins);
    const pointerAngle = (expectations[outcome] + stopAngle) % 360;
    assert.ok(Math.abs(pointerAngle) < 0.001 || Math.abs(pointerAngle - 360) < 0.001);
  }
});

test("random landing positions stay within the actual winning sector", () => {
  const percentages = { coins: 4, red: 48, black: 48 };
  const starts = { coins: 0, red: 4, black: 52 };

  for (const outcome of ["coins", "red", "black"]) {
    for (const position of [0.025, 0.31, 0.72, 0.974]) {
      const stopAngle = getWheelStopAngle(
        outcome,
        percentages.red,
        percentages.black,
        percentages.coins,
        -1.8,
        position,
      );
      const expectedSectorAngle = -1.8 + (starts[outcome] + percentages[outcome] * position) * 3.6;
      const pointerAngle = ((expectedSectorAngle + stopAngle) % 360 + 360) % 360;
      assert.ok(Math.abs(pointerAngle) < 0.001 || Math.abs(pointerAngle - 360) < 0.001);
    }
  }
});

test("spin makes five fast turns and lands exactly on the outcome for gradual deceleration", () => {
  const angles = getWheelSpinAngles(354.6, 261);
  assert.ok(angles.endAngle - 354.6 >= 5 * 360);
  assert.equal(normalizeWheelAngle(angles.endAngle), 261);
  assert.equal(WHEEL_SPIN_EASING, "cubic-bezier(.05,.72,.16,1)");
});
