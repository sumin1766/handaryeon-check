import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { isSeasonActivationWrite } from "./season-activation";

describe("isSeasonActivationWrite", () => {
  test("activating a season is allowed in view-only mode", () =>
    assert.equal(isSeasonActivationWrite({ table: "seasons", action: "update", values: { is_active: true } }), true));
  test("deactivating the previous season is allowed", () =>
    assert.equal(isSeasonActivationWrite({ table: "seasons", action: "update", values: { is_active: false } }), true));
  test("editing season name stays blocked", () =>
    assert.equal(isSeasonActivationWrite({ table: "seasons", action: "update", values: { name: "x" } }), false));
  test("mixing is_active with other fields stays blocked", () =>
    assert.equal(isSeasonActivationWrite({ table: "seasons", action: "update", values: { is_active: true, name: "x" } }), false));
  test("other tables stay blocked", () =>
    assert.equal(isSeasonActivationWrite({ table: "lodgings", action: "update", values: { is_active: true } }), false));
  test("insert/delete on seasons stays blocked", () => {
    assert.equal(isSeasonActivationWrite({ table: "seasons", action: "insert", values: { is_active: true } }), false);
    assert.equal(isSeasonActivationWrite({ table: "seasons", action: "delete" }), false);
  });
});
