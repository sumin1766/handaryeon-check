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
