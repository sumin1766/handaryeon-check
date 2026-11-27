import { describe, test as it } from "node:test";
import { strict as assert } from "node:assert";
import { rewriteNote, staffNoteRest, systemNoteTokens } from "./people-note";

describe("재확정 비고 재작성", () => {
  it("직원 자유 비고는 보존하고 시스템 토큰만 신청자 값으로 바꾼다", () => {
    const old = "초등 · 외부숙박 · 010-1111-2222 · 알레르기 있음";
    const sys = systemNoteTokens({ categoryNote: undefined, external: false, phone: "010-3333-4444" });
    assert.equal(rewriteNote(old, sys), "010-3333-4444 · 알레르기 있음");
  });
  it("신청자가 외부숙박·분류를 추가하면 반영된다", () => {
    const sys = systemNoteTokens({ categoryNote: "유아유치", external: true, phone: null });
    assert.equal(rewriteNote("버스 탑승", sys), "유아유치 · 외부숙박 · 버스 탑승");
  });
  it("시스템 토큰이 모두 사라지고 직원 비고도 없으면 null", () => {
    assert.equal(rewriteNote("초등 · 01012345678", []), null);
  });
  it("숫자가 섞인 일반 문장은 직원 비고로 남는다", () => {
    assert.deepEqual(staffNoteRest("3일차 늦게 도착 · 01012345678"), ["3일차 늦게 도착"]);
  });
});
