import { describe, test as it } from "node:test";
import { strict as assert } from "node:assert";
import { lodgingCounts, personToRow, rowToPersonFields, shortAddress, summarizeRosterChange, type RosterRow } from "./roster-edit";

const row = (o: Partial<RosterRow>): RosterRow => ({
  key: "k", id: "1", name: "가", phone: "01012345678", category: "male_adult", lodging_type: "church", note: "", pre_registration_id: "p1", ...o,
});

describe("roster edit", () => {
  it("round-trips infant category, external lodging and phone through people note", () => {
    const f = rowToPersonFields(row({ category: "female_infant", lodging_type: "external", phone: "" }));
    assert.deepEqual(f, { name: "가", gender: "F", age_group: "student", lodging: false, note: "유아유치 · 외부숙박" });
    const back = personToRow({ id: "1", pre_registration_id: "p1", ...f });
    assert.equal(back.category, "female_infant");
    assert.equal(back.lodging_type, "external");
  });
  it("counts lodging / non-lodging / total", () => {
    assert.deepEqual(lodgingCounts([{ lodging: true }, { lodging: false }, { lodging: false }]), { lodging: 1, nonLodging: 2, total: 3 });
  });
  it("shows only sido + sigungu", () => {
    assert.equal(shortAddress({ sido: "서울특별시", sigungu: "강남구" }), "서울특별시 강남구");
    assert.equal(shortAddress(null), "");
  });
  it("infant change makes fee 0 and is reported", () => {
    const s = summarizeRosterChange([row({})], [row({ category: "male_infant" })], {}, 30000);
    assert.equal(s.feeDelta, -30000);
    assert.equal(s.countDelta, 0);
    assert.ok(s.lines.some((l) => l.includes("분류")));
  });
  it("added person increases count and fee", () => {
    const s = summarizeRosterChange([row({})], [row({}), row({ id: null, key: "n", name: "나" })], {}, 30000);
    assert.equal(s.countDelta, 1);
    assert.equal(s.feeDelta, 30000);
  });
});
