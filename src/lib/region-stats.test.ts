/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { aggregateRegions, regionBins, regionLevel, type RegionRegistration } from "./region-stats";
const reg = (id: string, church_id: string | null = null, region_sido: string | null = "서울특별시", region_sigungu: string | null = "관악구"): RegionRegistration => ({ id, church_id, region_sido, region_sigungu, season_id: "active", created_at: id });
const church = { id: "c", season_id: "active", primary_pre_registration_id: null };
describe("지역별 교회 표시 집계", () => {
  test("같은 교회로 연결된 2건은 1교회", () => { expect(aggregateRegions("active", "2027 겨울캠프", [church], [reg("1", "c"), reg("2", "c")]).total).toBe(1); });
  test("대표 주소로 집계", () => { expect(aggregateRegions("active", "2027 겨울캠프", [{ ...church, primary_pre_registration_id: "2" }], [reg("1", "c"), reg("2", "c", "부산광역시", "강서구")]).provinces["부산광역시"]).toBe(1); });
  test("대표 미입력은 미분류", () => { expect(aggregateRegions("active", "2027 겨울캠프", [{ ...church, primary_pre_registration_id: "1" }], [reg("1", "c", null, null), reg("2", "c")]).unknown).toBe(1); });
  test("대표가 없으면 최초 유효 주소 사용", () => { expect(aggregateRegions("active", "2027 겨울캠프", [church], [reg("1", "c", null, null), reg("2", "c")]).provinces["서울특별시"]).toBe(1); });
  test("기존 주소 없는 교회 누락 없음", () => { expect(aggregateRegions("active", "2027 겨울캠프", [church], []).unknown).toBe(1); });
  test("과거 시즌은 제외", () => { expect(aggregateRegions("active", "2027 겨울캠프", [{ ...church, season_id: "past" }], [{ ...reg("1"), season_id: "past" }]).total).toBe(0); });
  test("다른 시도의 시군구는 미분류", () => { expect(aggregateRegions("active", "2027 겨울캠프", [], [reg("1", null, "부산광역시", "관악구")]).unknown).toBe(1); });
  test("미연결 제출은 각각 집계", () => { expect(aggregateRegions("active", "2027 겨울캠프", [], [reg("1"), reg("2")]).total).toBe(2); });
  test("시도 소계와 미분류 합은 전체 합계", () => { const s = aggregateRegions("active", "2027 겨울캠프", [church], [reg("1"), reg("2")]); expect(s.rows.filter((r) => r.kind === "subtotal" || r.kind === "unknown").reduce((n, r) => n + r.count, 0)).toBe(3); });
  test("0은 흰색 단계, 양수는 연함에서 진함", () => { const bins = regionBins({ a: 1, b: 5, c: 10 }); expect(regionLevel(0, bins)).toBe(0); expect(regionLevel(1, bins)).toBe(1); expect(regionLevel(10, bins)).toBe(5); expect(bins).toHaveLength(3); });
  test("모든 양수 구간 포함", () => { const bins = regionBins({ a: 2, b: 13, c: 26, d: 40, e: 55 }); for (let n = 2; n <= 55; n++) expect(bins.filter((b) => n >= b.min && n <= b.max)).toHaveLength(1); });
});