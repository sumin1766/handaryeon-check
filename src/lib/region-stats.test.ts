import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { aggregateRegions, regionBins, regionLevel, type RegionRegistration , regionLevelIsDark } from "./region-stats";
const reg = (id: string, church_id: string | null = null, region_sido: string | null = "서울특별시", region_sigungu: string | null = "관악구"): RegionRegistration => ({ id, church_id, region_sido, region_sigungu, season_id: "active", created_at: id, status: "applied" });
const church = { id: "c", season_id: "active", primary_pre_registration_id: null };
describe("지역별 교회 표시 집계", () => {
  test("같은 교회로 연결된 2건은 1교회", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [church], [reg("1", "c"), reg("2", "c")]).total, 1); });
  test("대표 주소로 집계", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [{ ...church, primary_pre_registration_id: "2" }], [reg("1", "c"), reg("2", "c", "부산광역시", "강서구")]).provinces["부산광역시"], 1); });
  test("대표 미입력은 같은 교회의 확정 대구 주소 사용", () => { const stats = aggregateRegions("active", "2027 겨울캠프", [{ ...church, primary_pre_registration_id: "1" }], [reg("1", "c", null, null), reg("2", "c", "대구광역시", "북구")]); assert.equal(stats.unknown, 0); assert.equal(stats.provinces["대구광역시"], 1); assert.equal(stats.total, 1); });
  test("주소 없는 확정 건과 주소 있는 미확정 건만 있으면 미분류", () => { const stats = aggregateRegions("active", "2027 겨울캠프", [church], [reg("1", "c", null, null), { ...reg("2", "c", "대구광역시", "북구"), status: "submitted" }]); assert.equal(stats.unknown, 1); assert.equal(stats.provinces["대구광역시"], 0); });
  test("대표가 없으면 최초 유효 주소 사용", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [church], [reg("1", "c", null, null), reg("2", "c")]).provinces["서울특별시"], 1); });
  test("확정 건 없는 교회는 집계 제외", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [church], []).total, 0); });
  test("미확정 제출은 제외", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [], [reg("1"), { ...reg("2"), status: "submitted" }, { ...reg("3"), status: "needs_review" }]).total, 1); });
  test("시도 소계가 시군구보다 먼저, 미분류·합계는 맨 끝", () => { const r = aggregateRegions("active", "2027 겨울캠프", [], [reg("1"), reg("2", null, null, null)]).rows; assert.deepEqual(r.map((x) => x.kind), ["subtotal", "district", "unknown", "total"]); });
  test("과거 시즌은 제외", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [{ ...church, season_id: "past" }], [{ ...reg("1"), season_id: "past" }]).total, 0); });
  test("다른 시도의 시군구는 미분류", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [], [reg("1", null, "부산광역시", "관악구")]).unknown, 1); });
  test("미연결 제출은 각각 집계", () => { assert.equal(aggregateRegions("active", "2027 겨울캠프", [], [reg("1"), reg("2")]).total, 2); });
  test("시도 소계와 미분류 합은 전체 합계", () => { const s = aggregateRegions("active", "2027 겨울캠프", [church], [reg("1"), reg("2"), reg("3", null, null, null)]); assert.equal(s.rows.filter((r) => r.kind === "subtotal" || r.kind === "unknown").reduce((n, r) => n + r.count, 0), 3); });
  test("0은 흰색 단계, 양수는 연함에서 진함", () => { const bins = regionBins({ a: 1, b: 5, c: 10 }); assert.equal(regionLevel(0, bins), 0); assert.equal(regionLevel(1, bins), 1); assert.equal(regionLevel(10, bins), 5); assert.equal((bins).length, 3); });
  test("모든 양수 구간 포함", () => { const bins = regionBins({ a: 2, b: 13, c: 26, d: 40, e: 55 }); for (let n = 2; n <= 55; n++) assert.equal((bins.filter((b) => n >= b.min && n <= b.max)).length, 1); });
});
test("지역 카드 글자: 진한 단계(3 이상)만 밝은 글자", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(regionLevelIsDark), [false, false, false, true, true, true]);
});
