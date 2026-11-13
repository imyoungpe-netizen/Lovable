import assert from "node:assert/strict";
import test from "node:test";
import {
  getRouletteReelFrame,
  getRouletteReelLandingFraction,
  getRouletteReelMotionPlan,
  getRouletteReelBrakingProgress,
  ROULETTE_REEL_BRAKING_EASING,
  ROULETTE_REEL_BLACK_COUNT,
  ROULETTE_REEL_COPY_COUNT,
  ROULETTE_REEL_COIN_COUNT,
  ROULETTE_REEL_CYCLE_SIZE,
  ROULETTE_REEL_DECELERATION_RUNWAY_CYCLES,
  ROULETTE_REEL_LAUNCH_CYCLES,
  ROULETTE_REEL_MIN_COIN_PASSES,
  ROULETTE_REEL_RED_COUNT,
  ROULETTE_REEL_STOP_COPY_INDEX,
} from "./roulette-reel.ts";

const circularDistance = (left, right) => {
  const distance = Math.abs(left - right);
  return Math.min(distance, ROULETTE_REEL_CYCLE_SIZE - distance);
};

test("braking has a shorter near-stationary tail without changing the launch plan", () => {
  assert.equal(ROULETTE_REEL_BRAKING_EASING, "cubic-bezier(.05,.72,.26,1)");
  const plan = getRouletteReelMotionPlan(0, -150, 25, 15_000);
  assert.equal(plan.accelerationMs, 160);
  assert.equal(plan.launchMs, 900);
  assert.equal(plan.launchEndX, -52.5);
  const longerLegacySpinPlan = getRouletteReelMotionPlan(0, -150, 25, 9_500);
  assert.equal(longerLegacySpinPlan.accelerationMs, plan.accelerationMs);
  assert.equal(longerLegacySpinPlan.launchMs, plan.launchMs);
  assert.equal(longerLegacySpinPlan.launchEndX, plan.launchEndX);
  const progress = 0.8;
  const step = 0.001;
  const oldMovement = Math.pow(1 - progress, 14) - Math.pow(1 - progress - step, 14);
  const newMovement = getRouletteReelBrakingProgress(progress + step) - getRouletteReelBrakingProgress(progress);
  assert.ok(newMovement > oldMovement);
  assert.equal(getRouletteReelBrakingProgress(0), 0);
  assert.equal(getRouletteReelBrakingProgress(1), 1);
});

test("each reel cycle keeps exactly 12 red, 12 black, and one coin", () => {
  for (const roundNumber of [1, 2, 19, 202]) {
    for (const outcome of ["red", "black", "coins", null]) {
      const frame = getRouletteReelFrame(roundNumber, outcome);
      assert.equal(frame.symbols.length, ROULETTE_REEL_CYCLE_SIZE);
      assert.equal(frame.symbols.filter((symbol) => symbol === "red").length, ROULETTE_REEL_RED_COUNT);
      assert.equal(frame.symbols.filter((symbol) => symbol === "black").length, ROULETTE_REEL_BLACK_COUNT);
      assert.equal(frame.symbols.filter((symbol) => symbol === "coins").length, ROULETTE_REEL_COIN_COUNT);
    }
  }
});

test("the marked stopping cell always matches the server outcome", () => {
  for (const outcome of ["red", "black", "coins"]) {
    for (let roundNumber = 1; roundNumber <= 40; roundNumber += 1) {
      const frame = getRouletteReelFrame(roundNumber, outcome);
      assert.equal(frame.symbols[frame.targetIndex], outcome);
      if (outcome === "coins") {
        assert.equal(frame.coinIndex, frame.targetIndex);
      } else {
        assert.ok(circularDistance(frame.targetIndex, frame.coinIndex) > 2);
      }
    }
  }
});

test("the coin crosses the pointer at least twice before every stop position", () => {
  assert.ok(ROULETTE_REEL_COPY_COUNT >= ROULETTE_REEL_STOP_COPY_INDEX + 2);
  for (let roundNumber = 1; roundNumber <= 80; roundNumber += 1) {
    for (const outcome of ["red", "black", "coins"]) {
      const frame = getRouletteReelFrame(roundNumber, outcome);
      const stopIndex = ROULETTE_REEL_STOP_COPY_INDEX * ROULETTE_REEL_CYCLE_SIZE + frame.targetIndex;
      assert.ok(
        ROULETTE_REEL_COPY_COUNT * ROULETTE_REEL_CYCLE_SIZE - 1 - stopIndex >= ROULETTE_REEL_CYCLE_SIZE - 1,
        "leave a full additional symbol cycle after the result",
      );
      for (let startPhase = 0; startPhase < ROULETTE_REEL_CYCLE_SIZE; startPhase += 1) {
        let passes = 0;
        for (let index = frame.coinIndex; index < stopIndex; index += ROULETTE_REEL_CYCLE_SIZE) {
          if (index > startPhase) passes += 1;
        }
        assert.ok(passes >= ROULETTE_REEL_MIN_COIN_PASSES);
      }
    }
  }
});

test("the reel launches through two cycles almost immediately and preserves a long slowdown", () => {
  for (let startPhase = 0; startPhase < ROULETTE_REEL_CYCLE_SIZE; startPhase += 1) {
    for (let targetIndex = 0; targetIndex < ROULETTE_REEL_CYCLE_SIZE; targetIndex += 1) {
      const startX = -startPhase;
      const stopIndex = ROULETTE_REEL_STOP_COPY_INDEX * ROULETTE_REEL_CYCLE_SIZE + targetIndex;
      const endX = -stopIndex;
      const plan = getRouletteReelMotionPlan(startX, endX, ROULETTE_REEL_CYCLE_SIZE, 15_000);
      const launchCycles = Math.abs(plan.launchEndX - startX) / ROULETTE_REEL_CYCLE_SIZE;
      const slowdownCycles = Math.abs(endX - plan.launchEndX) / ROULETTE_REEL_CYCLE_SIZE;
      assert.ok(launchCycles >= ROULETTE_REEL_LAUNCH_CYCLES - 0.01);
      assert.ok(slowdownCycles >= ROULETTE_REEL_DECELERATION_RUNWAY_CYCLES - 0.01);
      assert.equal(plan.accelerationMs, 160);
      assert.equal(plan.launchMs, 900);
    }
  }
});

test("result positions vary around the reel while the coin location stays independent of red/black outcomes", () => {
  const frames = Array.from({ length: 250 }, (_, index) => getRouletteReelFrame(index + 1, "red"));
  assert.ok(new Set(frames.map((frame) => frame.targetIndex)).size > 15);
  assert.ok(new Set(frames.map((frame) => frame.coinIndex)).size > 15);
});

test("the symbol order stays identical when the server reveals its outcome", () => {
  const red = getRouletteReelFrame(37, "red");
  const black = getRouletteReelFrame(37, "black");
  const coin = getRouletteReelFrame(37, "coins");
  const unopened = getRouletteReelFrame(37, null);
  assert.deepEqual(red.symbols, unopened.symbols);
  assert.deepEqual(black.symbols, unopened.symbols);
  assert.deepEqual(coin.symbols, unopened.symbols);
});

test("reel landing offset varies across the tile without reaching a boundary", () => {
  const positions = [0, 0.25, 0.5, 0.75, 1].map(getRouletteReelLandingFraction);
  assert.ok(positions.every((position) => position > 0.15 && position < 0.85));
  assert.ok(new Set(positions).size === positions.length);
  assert.equal(getRouletteReelLandingFraction(0.5), 0.5);
  assert.equal(getRouletteReelLandingFraction(null), 0.5);
});
