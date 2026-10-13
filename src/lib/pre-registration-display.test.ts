import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { duplicateSubmissionCount, uniqueManagerDisplay } from "./pre-registration-display";

const manager = (preRegistrationId: string, name = "홍길동", phone = "01012345678") => ({ preRegistrationId, name, phone });
describe("사전접수 표시 전용 규칙", () => {
  test("확정 5건 − 확정 교회 4곳 = 중복 1건", () => assert.equal(duplicateSubmissionCount(5, 4), 1));
  test("이름과 전화번호가 모두 같은 담당자는 한 줄", () => assert.equal(uniqueManagerDisplay([manager("1"), manager("2")], null).length, 1));
  test("이름이 다르면 각각 표시", () => assert.equal(uniqueManagerDisplay([manager("1"), manager("2", "김길동")], null).length, 2));
  test("전화번호가 다르면 각각 표시", () => assert.equal(uniqueManagerDisplay([manager("1"), manager("2", "홍길동", "01087654321")], null).length, 2));
  test("공백·전화번호 형식을 정규화하지 않고 완전 일치만 적용", () => assert.equal(uniqueManagerDisplay([manager("1"), manager("2", "홍길동 "), manager("3", "홍길동", "010-1234-5678")], null).length, 3));
  test("중복 중 대표의 ID 유지", () => assert.equal(uniqueManagerDisplay([manager("1"), manager("2")], "2")[0]?.preRegistrationId, "2"));
  test("원본 신청 목록 불변", () => { const input = [manager("1"), manager("2")]; const before = structuredClone(input); uniqueManagerDisplay(input, "2"); assert.deepEqual(input, before); assert.equal(input.length, 2); });
});