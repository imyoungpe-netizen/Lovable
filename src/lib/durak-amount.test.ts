import assert from "node:assert/strict";
import test from "node:test";
import { parseDurakWholeAmount } from "./durak-amount.js";

test("parses Russian thousands separators as whole game-credit amounts", () => {
  assert.equal(parseDurakWholeAmount("15.250"), 15_250);
  assert.equal(parseDurakWholeAmount("15 250"), 15_250);
  assert.equal(parseDurakWholeAmount("15,250"), 15_250);
  assert.equal(parseDurakWholeAmount(""), null);
  assert.equal(parseDurakWholeAmount("15.25x"), null);
});
