import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatPhone, isPhoneComplete, phoneDigits } from "./phone-format";

describe("phone format", () => {
  test("휴대폰 하이픈 표시", () => assert.equal(formatPhone("01012345678"), "010-1234-5678"));
  test("저장 값은 숫자만", () => assert.equal(phoneDigits("010-1234-5678"), "01012345678"));
  test("11자리에서만 완성", () => {
    assert.equal(isPhoneComplete("0101234567"), false);
    assert.equal(isPhoneComplete("01012345678"), true);
  });
});

import { phone010FromTail, phone010Tail } from "./phone-format";
describe("010 fixed prefix", () => {
  test("뒤 8자리 → 숫자만 저장", () => assert.equal(phone010FromTail("1234-5678"), "01012345678"));
  test("뒤 자리 비면 빈 값(010만 저장 금지)", () => assert.equal(phone010FromTail(""), ""));
  test("저장 값 → 뒤 자리 표시", () => assert.equal(phone010Tail("01012345678"), "1234-5678"));
});
