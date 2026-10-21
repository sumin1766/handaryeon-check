import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { DRAFT_TTL_MS, draftKey, parseDraft } from "./apply-draft";

const data = {
  consented: true, churchName: "a", denomination: "", managerName: "", managerPhone: "",
  region: { sido: "", sigungu: "", road: "" }, rows: [],
};

describe("apply draft", () => {
  test("72시간 이내는 복원", () => {
    const now = 1_000_000_000;
    const raw = JSON.stringify({ savedAt: now - (72 * 3600 * 1000 - 1), data });
    assert.ok(parseDraft(raw, now));
  });
  test("72시간 초과는 폐기", () => {
    const now = 1_000_000_000;
    const raw = JSON.stringify({ savedAt: now - DRAFT_TTL_MS - 1, data });
    assert.equal(parseDraft(raw, now), null);
  });
  test("시즌별 키 분리", () => assert.notEqual(draftKey("s1"), draftKey("s2")));
});
