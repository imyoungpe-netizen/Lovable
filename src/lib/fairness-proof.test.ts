import assert from "node:assert/strict";
import test from "node:test";
import { createFairRandom, hashFairnessSeed } from "../../../api-server/src/lib/dark-ace-provably-fair.js";
import {
  commitCrashSeed,
  deriveCrashMultiplierHundredths,
} from "../../../api-server/src/lib/dark-ace-crash-game.js";
import { createBlackjackShoe } from "../../../api-server/src/lib/dark-ace-blackjack-game.js";
import { drawFruitFromTicket, FRUIT_TOTAL_WEIGHT } from "../../../api-server/src/lib/dark-ace-fruits-game.js";
import { verifyFairnessOutcome } from "./fairness-proof.js";

const serverSeed = "a".repeat(64);
const clientSeed = "proof-test-round";
const hash = hashFairnessSeed(serverSeed);

function proof(game: string, scope: string, ranges: number[], build: (draws: number[]) => {
  outcome: Record<string, unknown>;
  inputs: Record<string, unknown>;
}) {
  const random = createFairRandom(serverSeed, clientSeed, scope);
  const draws = ranges.map((range) => random.int(range));
  return {
    game,
    serverSeedHash: hash,
    clientSeed,
    serverSeedReveal: serverSeed,
    ...build(draws),
  };
}

test("the browser verifier independently reproduces roulette, dice, fruit, battle and UPGRADE", async () => {
  const cases = [
    proof("lenta", "shared-roulette:legacy", [100], ([draw]) => ({
      outcome: { result: draw! < 48 ? "red" : draw! < 96 ? "black" : "coins" },
      inputs: { redPercent: 48, blackPercent: 48 },
    })),
    proof("european_roulette", "shared-roulette:european", [37], ([number]) => ({
      outcome: { number },
      inputs: {},
    })),
    proof("dice", "dice", [6, 6], ([one, two]) => ({
      outcome: { die1: one! + 1, die2: two! + 1, total: one! + two! + 2 },
      inputs: {},
    })),
    proof("fruits", "fruits", [FRUIT_TOTAL_WEIGHT], ([ticket]) => ({
      outcome: { fruit: drawFruitFromTicket(ticket!).fruitId },
      inputs: {},
    })),
    proof("battle", "battle", [100], ([ticket]) => {
      const entries = [{ id: "first", amount: 40 }, { id: "second", amount: 60 }];
      return {
        outcome: { winnerEntryId: ticket! < 40 ? "first" : "second" },
        inputs: { totalPot: 100, entries },
      };
    }),
    proof("upgrade", "upgrade", [10_000], ([randomRoll]) => ({
      outcome: { randomRoll, won: randomRoll! < 4_200 },
      inputs: { chanceBasisPoints: 4_200 },
    })),
  ];
  for (const item of cases) assert.equal(await verifyFairnessOutcome(item), true, item.game);
});

test("the browser verifier reproduces the Blackjack shoe and Crash point", async () => {
  const blackjackRandom = createFairRandom(serverSeed, clientSeed, "blackjack");
  const shoeOrder = createBlackjackShoe((maxExclusive) => blackjackRandom.int(maxExclusive));
  assert.equal(await verifyFairnessOutcome({
    game: "blackjack",
    serverSeedHash: hash,
    clientSeed,
    serverSeedReveal: serverSeed,
    outcome: {},
    inputs: { shoeOrder },
  }), true);

  const crashMultiplierHundredths = deriveCrashMultiplierHundredths(serverSeed, clientSeed);
  assert.equal(commitCrashSeed(serverSeed), hash);
  assert.equal(await verifyFairnessOutcome({
    game: "crash",
    serverSeedHash: hash,
    clientSeed,
    serverSeedReveal: serverSeed,
    outcome: { crashMultiplierHundredths },
    inputs: { houseEdgeBps: 500 },
  }), true);
});

test("the verifier rejects a mismatched seed or outcome", async () => {
  const bad = proof("dice", "dice", [6, 6], () => ({
    outcome: { die1: 1, die2: 1, total: 2 },
    inputs: {},
  }));
  assert.equal(await verifyFairnessOutcome(bad), false);
  assert.equal(await verifyFairnessOutcome({ ...bad, serverSeedHash: "0".repeat(64) }), false);
});
