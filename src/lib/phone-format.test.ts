import { describe, expect, test } from "vitest";
import { formatPhone, isPhoneComplete, phoneDigits } from "./phone-format";

describe("phone format", () => {
  test("휴대폰 하이픈 표시", () => expect(formatPhone("01012345678")).toBe("010-1234-5678"));
  test("저장 값은 숫자만", () => expect(phoneDigits("010-1234-5678")).toBe("01012345678"));
  test("11자리에서만 완성", () => {
    expect(isPhoneComplete("0101234567")).toBe(false);
    expect(isPhoneComplete("01012345678")).toBe(true);
  });
});
