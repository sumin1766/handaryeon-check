import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { canRunReset, isSeasonNameConfirmed } from "./season-reset";

describe("season reset confirmation", () => {
  test("partial reset needs exact season name", () =>
    assert.equal(canRunReset({ item: "places", typedName: "2027 겨울캠프", seasonName: "2027 겨울캠프" }), true));
  test("partial reset rejects wrong name", () =>
    assert.equal(canRunReset({ item: "places", typedName: "2027 겨울캠프 ", seasonName: "2027 겨울캠프" }), false));
  test("full reset needs password too", () =>
    assert.equal(canRunReset({ item: "all", typedName: "2027 겨울캠프", seasonName: "2027 겨울캠프" }), false));
  test("full reset with name and password allowed", () =>
    assert.equal(canRunReset({ item: "all", typedName: "2027 겨울캠프", seasonName: "2027 겨울캠프", password: "x" }), true));
  test("no season name never confirms", () => assert.equal(isSeasonNameConfirmed("", undefined), false));
});
