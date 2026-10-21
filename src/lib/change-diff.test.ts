import { describe, test as it } from "node:test";
import { strict as assert } from "node:assert";
import { actorLabel, batchColorIndex, diffMembers, personToMember } from "./change-diff";

describe("change history diff", () => {
  it("records rename with before/after when headcount is unchanged", () => {
    assert.deepEqual(diffMembers([{ key: "1", name: "ㄴㅇㄹ" }], [{ key: "1", name: "나이스" }]), [
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
    assert.deepEqual(lines, [
      "가: 전화번호 '01011112222' → '01033334444' 변경",
      "가: 분류 '여아(유아유치)' → '남학생(중고청)' 변경",
      "가: 숙박 '비숙박' → '교회숙박' 변경",
      "참석자 '다' 추가",
      "참석자 '나' 삭제",
    ]);
  });
  it("labels actors by role, unknown as plain 수정", () => {
    assert.equal(actorLabel("admin"), "전체관리자 수정");
    assert.equal(actorLabel("staff"), "접수 담당자 수정");
    assert.equal(actorLabel("user"), "사용자(본인) 수정");
    assert.equal(actorLabel(null), "수정");
  });
  it("maps operating person back to category, lodging and phone", () => {
    assert.deepEqual(personToMember({ gender: "F", age_group: "student", lodging: false, note: "유아유치 · 외부숙박 · 01012345678" }), {
      category: "female_infant", lodging_type: "external", phone: "01012345678", note: null,
    });
  });
  it("colors only merged churches, stable by sorted order", () => {
    assert.equal(batchColorIndex(["a"], "a"), null);
    assert.equal(batchColorIndex(["a", "b", "c"], "c"), 2);
    assert.equal(batchColorIndex(["a", "b"], null), null);
  });
});
