import assert from "node:assert/strict";
import test from "node:test";
import { formatCredits, getRussianCreditWord, normalizeCurrencyText } from "./currency-format.js";

test("formats credit amounts with correct Russian word forms", () => {
  assert.equal(formatCredits(1), "1 кредит");
  assert.equal(formatCredits(2), "2 кредита");
  assert.equal(formatCredits(5), "5 кредитов");
  assert.equal(formatCredits(11), "11 кредитов");
  assert.equal(formatCredits(21), "21 кредит");
  assert.equal(formatCredits(-24), "-24 кредита");
});

test("normalizes currency words in transaction history from the amount", () => {
  assert.equal(normalizeCurrencyText("Начислено 1 кр."), "Начислено 1 кредит");
  assert.equal(normalizeCurrencyText("Списано 2 кредита"), "Списано 2 кредита");
  assert.equal(normalizeCurrencyText("Выплата 14 кредитов"), "Выплата 14 кредитов");
  assert.equal(normalizeCurrencyText("Перевод 21 DC"), "Перевод 21 кредит");
});
