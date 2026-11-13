import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUtcDate } from "./daily-quest-date";

describe("parseUtcDate", () => {
  it("accepts date-only values without creating an invalid timestamp", () => {
    assert.equal(parseUtcDate("2026-10-15").toISOString(), "2026-10-15T00:00:00.000Z");
  });

  it("also accepts ISO timestamps returned by older API responses", () => {
    assert.equal(parseUtcDate("2026-10-15T00:00:00.000Z").toISOString(), "2026-10-15T00:00:00.000Z");
  });
});
