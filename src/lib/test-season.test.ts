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
