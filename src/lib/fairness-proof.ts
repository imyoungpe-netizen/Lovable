const ALGORITHM = "dark-ace-hmac-sha256-v1";

function hexToBytes(hex: string): Uint8Array {
  if (!/^[\da-f]{64}$/i.test(hex)) throw new Error("INVALID_FAIRNESS_SEED");
  return Uint8Array.from(hex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySeedCommitment(serverSeedHash: string, serverSeedReveal: string): Promise<boolean> {
  try {
    return await sha256Hex(hexToBytes(serverSeedReveal)) === serverSeedHash.toLowerCase();
  } catch {
    return false;
  }
}

async function fairInt(
  serverSeed: string,
  clientSeed: string,
  scope: string,
  maxExclusive: number,
): Promise<number> {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 53) {
    throw new Error("INVALID_FAIRNESS_RANGE");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(serverSeed).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = new TextEncoder().encode(`${ALGORITHM}|${scope}|${clientSeed}|0`);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const sample = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, false)
    & ((1n << 53n) - 1n);
  const range = BigInt(maxExclusive);
  const sampleSpace = 1n << 53n;
  const acceptanceLimit = sampleSpace - (sampleSpace % range);
  if (sample >= acceptanceLimit) {
    // A rejection is exceptionally unlikely, but follow the server's counter stream exactly.
    for (let counter = 1; counter < 1_000; counter += 1) {
      const next = new Uint8Array(await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${ALGORITHM}|${scope}|${clientSeed}|${counter}`),
      ));
      const nextSample = new DataView(next.buffer, next.byteOffset, next.byteLength).getBigUint64(0, false)
        & ((1n << 53n) - 1n);
      if (nextSample < acceptanceLimit) return Number(nextSample % range);
    }
    throw new Error("FAIRNESS_REJECTION_LIMIT");
  }
  return Number(sample % range);
}

async function fairDraws(
  serverSeed: string,
  clientSeed: string,
  scope: string,
  ranges: number[],
): Promise<number[]> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(serverSeed).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  let counter = 0;
  const output: number[] = [];
  for (const maxExclusive of ranges) {
    const range = BigInt(maxExclusive);
    const space = 1n << 53n;
    const limit = space - (space % range);
    while (true) {
      const digest = new Uint8Array(await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${ALGORITHM}|${scope}|${clientSeed}|${counter++}`),
      ));
      const sample = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, false)
        & (space - 1n);
      if (sample < limit) {
        output.push(Number(sample % range));
        break;
      }
    }
  }
  return output;
}

type FairnessProofData = {
  game: string;
  roundKey: string;
  serverSeedHash: string | null;
  clientSeed: string | null;
  serverSeedReveal: string | null;
  outcome: Record<string, unknown>;
  inputs: Record<string, unknown>;
};

export async function verifyFairnessOutcome(proof: FairnessProofData): Promise<boolean> {
  const seed = proof.serverSeedReveal;
  const clientSeed = proof.clientSeed;
  if (!seed || !clientSeed || !proof.serverSeedHash ||
    !await verifySeedCommitment(proof.serverSeedHash, seed)) return false;
  const outcome = proof.outcome;
  const inputs = proof.inputs;
  if (proof.game === "lenta") {
    const [draw] = await fairDraws(seed, clientSeed, "shared-roulette:legacy", [100]);
    const red = Number(inputs.redPercent);
    const black = Number(inputs.blackPercent);
    const expected = draw < red ? "red" : draw < red + black ? "black" : "coins";
    return outcome.result === expected;
  }
  if (proof.game === "european_roulette") {
    const [number] = await fairDraws(seed, clientSeed, "shared-roulette:european", [37]);
    return outcome.number === number;
  }
  if (proof.game === "dice") {
    const [first, second] = await fairDraws(seed, clientSeed, "dice", [6, 6]);
    return outcome.die1 === first + 1 && outcome.die2 === second + 1 &&
      outcome.total === first + second + 2;
  }
  if (proof.game === "fruits") {
    const [ticket] = await fairDraws(seed, clientSeed, "fruits", [619]);
    const ranges: Array<[string, number]> = [
      ["apple", 120], ["kiwi", 120], ["orange", 120], ["watermelon", 15],
      ["mango", 120], ["grapes", 24], ["strawberry", 40], ["cherries", 60],
    ];
    let cursor = ticket;
    const fruit = ranges.find(([, weight]) => {
      if (cursor < weight) return true;
      cursor -= weight;
      return false;
    })?.[0];
    return outcome.fruit === fruit;
  }
  if (proof.game === "battle") {
    const entries = inputs.entries as Array<{ id: string; amount: number }> | undefined;
    const totalPot = Number(inputs.totalPot);
    if (!entries?.length || !Number.isSafeInteger(totalPot) || totalPot < 1 ||
      entries.reduce((sum, item) => sum + item.amount, 0) !== totalPot) return false;
    const [ticket] = await fairDraws(seed, clientSeed, "battle", [totalPot]);
    let cursor = ticket;
    const winner = entries.find((item) => {
      if (cursor < item.amount) return true;
      cursor -= item.amount;
      return false;
    });
    return outcome.winnerEntryId === winner?.id;
  }
  if (proof.game === "upgrade") {
    const [roll] = await fairDraws(seed, clientSeed, "upgrade", [10_000]);
    const chance = Number(inputs.chanceBasisPoints);
    return outcome.randomRoll === roll && outcome.won === (roll < chance);
  }
  if (proof.game === "blackjack") {
    const [draws] = [await fairDraws(
      seed,
      clientSeed,
      "blackjack",
      Array.from({ length: 311 }, (_, index) => 312 - index),
    )];
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    const expected: Array<{ rank: string; suit: string }> = [];
    for (let deck = 0; deck < 6; deck += 1) {
      for (const suit of suits) for (const rank of ranks) expected.push({ rank, suit });
    }
    for (let index = expected.length - 1, cursor = 0; index > 0; index -= 1, cursor += 1) {
      const swap = draws[cursor]!;
      [expected[index], expected[swap]] = [expected[swap]!, expected[index]!];
    }
    const actual = inputs.shoeOrder as Array<{ rank: string; suit: string }> | undefined;
    return Boolean(actual && actual.length === expected.length &&
      actual.every((card, index) => card.rank === expected[index]?.rank && card.suit === expected[index]?.suit));
  }
  if (proof.game === "crash") {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(seed).buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(clientSeed)));
    const hex = Array.from(digest.slice(0, 7), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const sample = BigInt(`0x${hex.slice(0, 13)}`);
    const range = 1n << 52n;
    const edge = BigInt(Number(inputs.houseEdgeBps));
    const raw = ((10_000n - edge) * range) / (100n * (range - sample));
    const expected = Math.max(100, Math.min(100_000_000, Number(raw)));
    return outcome.crashMultiplierHundredths === expected;
  }
  if (proof.game === "plinko") {
    const rows = Number(inputs.rows);
    const roundKey = proof.roundKey;
    const payoutTable = inputs.payoutMultipliersBasisPoints as number[] | undefined;
    const expectedPath = outcome.path as number[] | null;
    const expectedSlot = Number(outcome.slotIndex);
    const stake = Number(inputs.stake);
    if (!Number.isInteger(rows) || rows < 8 || rows > 16 || !payoutTable ||
      !Array.isArray(expectedPath) || expectedPath.length !== rows || !Number.isSafeInteger(stake)) return false;
    const path = await fairDraws(seed, clientSeed, `dark-ace-plinko:${roundKey}`, Array.from({ length: rows }, () => 2));
    const slot = path.reduce((sum, direction) => sum + direction, 0);
    const multiplier = payoutTable[slot];
    return path.every((direction, index) => direction === expectedPath[index]) &&
      slot === expectedSlot &&
      multiplier === Number(outcome.multiplierBasisPoints) &&
      Math.floor((stake * multiplier) / 10_000) === Number(outcome.payout);
  }
  return false;
}

export async function verifyUpgradeFairness(input: {
  serverSeedHash: string;
  serverSeedReveal: string | null;
  clientSeed: string;
  randomRoll: number;
}): Promise<boolean> {
  try {
    if (!input.serverSeedReveal) return false;
    if (!await verifySeedCommitment(input.serverSeedHash, input.serverSeedReveal)) return false;
    return await fairInt(input.serverSeedReveal, input.clientSeed, "upgrade", 10_000) === input.randomRoll;
  } catch {
    return false;
  }
}
