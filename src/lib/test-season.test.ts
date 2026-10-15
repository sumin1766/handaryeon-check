import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { isTestSeasonName } from "./test-season";

describe("isTestSeasonName", () => {
  test("names starting with __ are test", () => assert.equal(isTestSeasonName("__임시"), true));
  test("names containing LOADTEST are test", () => assert.equal(isTestSeasonName("2027 LOADTEST"), true));
  test("the load-test season is test", () => assert.equal(isTestSeasonName("__LOADTEST_시즌"), true));
  test("operating seasons are not test", () => assert.equal(isTestSeasonName("2027 겨울캠프"), false));
  test("empty name is not test", () => assert.equal(isTestSeasonName(null), false));
});

import { resolveApplyBlockMessage, TEST_SEASON_MAINTENANCE_MESSAGE, DEFAULT_APPLY_BLOCK_MESSAGE } from "./test-season";
describe("resolveApplyBlockMessage", () => {
  test("default allows submissions", () =>
    assert.equal(resolveApplyBlockMessage({ isTestSeason: false, manualBlocked: false }), null));
  test("manual block uses admin message", () =>
    assert.equal(resolveApplyBlockMessage({ isTestSeason: false, manualBlocked: true, manualMessage: "사전접수가 마감되었습니다." }), "사전접수가 마감되었습니다."));
  test("manual block with empty message uses default", () =>
    assert.equal(resolveApplyBlockMessage({ isTestSeason: false, manualBlocked: true, manualMessage: "  " }), DEFAULT_APPLY_BLOCK_MESSAGE));
  test("test season keeps maintenance message", () =>
    assert.equal(resolveApplyBlockMessage({ isTestSeason: true, manualBlocked: true, manualMessage: "마감" }), TEST_SEASON_MAINTENANCE_MESSAGE));
});
