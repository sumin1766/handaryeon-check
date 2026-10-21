import { describe, expect, it } from "vitest";
import { actorLabel, batchColorIndex, diffMembers, personToMember } from "./change-diff";

describe("change history diff", () => {
  it("records rename with before/after when headcount is unchanged", () => {
    expect(diffMembers([{ key: "1", name: "ㄴㅇㄹ" }], [{ key: "1", name: "나이스" }])).toEqual([
      "참석자 'ㄴㅇㄹ' → '나이스' 이름 변경",
    ]);
  });
  it("lists every changed field plus adds and removals", () => {
    const lines = diffMembers(
      [
        { key: "1", name: "가", phone: "01011112222", category: "female_infant", lodging: "none" },
        { key: "2", name: "나", phone: "", category: "male_adult", lodging: "none" },
      ],
      [
        { key: "1", name: "가", phone: "01033334444", category: "male_student", lodging: "church" },
        { name: "다", phone: "", category: "male_adult", lodging: "none" },
      ],
    );
    expect(lines).toEqual([
      "가: 전화번호 '01011112222' → '01033334444' 변경",
      "가: 분류 '여아(유아유치)' → '남학생(중고청)' 변경",
      "가: 숙박 '비숙박' → '교회숙박' 변경",
      "참석자 '다' 추가",
      "참석자 '나' 삭제",
    ]);
  });
  it("labels actors by role, unknown as plain 수정", () => {
    expect(actorLabel("admin")).toBe("전체관리자 수정");
    expect(actorLabel("staff")).toBe("접수 담당자 수정");
    expect(actorLabel("user")).toBe("사용자(본인) 수정");
    expect(actorLabel(null)).toBe("수정");
  });
  it("maps operating person back to category, lodging and phone", () => {
    expect(personToMember({ gender: "F", age_group: "student", lodging: false, note: "유아유치 · 외부숙박 · 01012345678" })).toEqual({
      category: "female_infant", lodging_type: "external", phone: "01012345678", note: null,
    });
  });
  it("colors only merged churches, stable by sorted order", () => {
    expect(batchColorIndex(["a"], "a")).toBeNull();
    expect(batchColorIndex(["a", "b", "c"], "c")).toBe(2);
    expect(batchColorIndex(["a", "b"], null)).toBeNull();
  });
});
