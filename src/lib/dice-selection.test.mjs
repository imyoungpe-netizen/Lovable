import assert from "node:assert/strict";
import test from "node:test";
import {
  getDiceMaximumPerSelection,
  isDiceSelectionSet,
  toggleDiceSelection,
} from "./dice-selection.ts";

test("DICE allows a single outcome or exactly seven paired with one side", () => {
  assert.equal(isDiceSelectionSet(["less_than_7"]), true);
  assert.equal(isDiceSelectionSet(["less_than_7", "exactly_7"]), true);
  assert.equal(isDiceSelectionSet(["greater_than_7", "exactly_7"]), true);
  assert.equal(isDiceSelectionSet(["less_than_7", "greater_than_7"]), false);
  assert.equal(isDiceSelectionSet(["less_than_7", "exactly_7", "greater_than_7"]), false);
  assert.equal(isDiceSelectionSet([]), false);
});

test("toggling lets a player choose, clear, and switch between the two approved pairs", () => {
  assert.deepEqual(toggleDiceSelection([], "less_than_7"), ["less_than_7"]);
  assert.deepEqual(toggleDiceSelection(["less_than_7"], "exactly_7"), ["less_than_7", "exactly_7"]);
  assert.deepEqual(toggleDiceSelection(["less_than_7", "exactly_7"], "greater_than_7"), ["exactly_7", "greater_than_7"]);
  assert.deepEqual(toggleDiceSelection(["greater_than_7", "exactly_7"], "exactly_7"), ["greater_than_7"]);
});

test("the amount per selected outcome keeps the total round stake at or below 250 million", () => {
  assert.equal(getDiceMaximumPerSelection(400_000_000, 1), 250_000_000);
  assert.equal(getDiceMaximumPerSelection(400_000_000, 2), 125_000_000);
  assert.equal(getDiceMaximumPerSelection(200_000, 2), 100_000);
  assert.equal(getDiceMaximumPerSelection(99, 2), 0);
});
