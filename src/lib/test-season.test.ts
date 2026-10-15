import { describe, expect, it } from "vitest";
import { isTestSeasonName } from "./test-season";

describe("isTestSeasonName", () => {
  it("treats names starting with __ as test", () => expect(isTestSeasonName("__임시")).toBe(true));
  it("treats names containing LOADTEST as test", () => expect(isTestSeasonName("__LOADTEST_시즌")).toBe(true));
  it("treats LOADTEST anywhere as test", () => expect(isTestSeasonName("2027 LOADTEST")).toBe(true));
  it("keeps operating seasons as non-test", () => expect(isTestSeasonName("2027 겨울캠프")).toBe(false));
  it("handles empty", () => expect(isTestSeasonName(null)).toBe(false));
});
