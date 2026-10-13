import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { buildRegionChurchList, churchListCsv, churchListClipboard, churchListSummary, type ExportRegistration } from "./region-church-list";
import { aggregateRegions } from "./region-stats";
const church = { id: "c", season_id: "active", primary_pre_registration_id: "2", name: "테스트교회", contact_name: "기본", phone: "01011111111" };
const reg = (id: string, church_id: string | null = "c", region_sido: string | null = "서울특별시", region_sigungu: string | null = "관악구"): ExportRegistration => ({ id, church_id, region_sido, region_sigungu, season_id: "active", created_at: id, status: "applied", church_name: `교회${id}`, manager_name: `담당자${id}`, manager_phone: "01012345678", head_count: 99 });
describe("지역 교회 목록 내보내기 규칙", () => {
  test("확정 5건의 같은 교회 2건은 목록과 집계 모두 4곳", () => { const regs = [reg("1"), reg("2"), reg("3", null), reg("4", null), reg("5", null)]; const list = buildRegionChurchList("active", "2027 겨울캠프", [church], regs, []); assert.equal(list.rows.length, 4); assert.equal(list.rows.length, aggregateRegions("active", "2027 겨울캠프", [church], regs).total); });
  test("미확정·과거 시즌은 목록에서 제외", () => { const list = buildRegionChurchList("active", "2027 겨울캠프", [], [{ ...reg("1", null), status: "submitted" }, { ...reg("2", null), season_id: "past" }], []); assert.equal(list.rows.length, 0); });
  test("대표 담당자·전화번호 유지, 인원은 기존 people 2행이지 신청 99명의 합이 아님", () => { const list = buildRegionChurchList("active", "2027 겨울캠프", [church], [reg("1"), reg("2")], [{ church_id: "c" }, { church_id: "c" }]); assert.equal(list.rows[0]?.managerName, "담당자2"); assert.equal(list.rows[0]?.phone, "01012345678"); assert.equal(list.rows[0]?.peopleCount, 2); });
  test("시도·시군구 순서와 미분류 마지막은 집계표와 동일", () => { const regs = [reg("1", null, null, null), reg("2", null, "부산광역시", "강서구"), reg("3", null, "서울특별시", "강남구"), reg("4", null, "서울특별시", "관악구")]; const list = buildRegionChurchList("active", "2027 겨울캠프", [], regs, []); assert.deepEqual(list.rows.map((r) => `${r.sido}|${r.sigungu}`), ["서울특별시|강남구", "서울특별시|관악구", "부산광역시|강서구", "미입력/미분류|—"]); });
  test("대표 주소 미입력은 목록도 미분류", () => { const list = buildRegionChurchList("active", "2027 겨울캠프", [church], [reg("1"), reg("2", "c", null, null)], []); assert.equal(list.rows[0]?.sido, "미입력/미분류"); });
   test("CSV는 시즌·일시·연락처와 한 교회 한 행, 특수 문자 인용", () => { const list = buildRegionChurchList("active", "2027 겨울캠프", [], [{ ...reg("1", null), church_name: '교회,"이름"' }], []); const csv = churchListCsv(list, "2026-10-13 17:49:00 (KST)"); assert.equal(csv.split("\r\n").length, 4); assert.ok(csv.includes('"2027 겨울캠프","2026-10-13 17:49:00 (KST)"')); assert.ok(csv.includes('"교회,""이름"""')); assert.ok(csv.includes('"01012345678"')); });
  test("CSV 수식 입력은 실행되지 않도록 문자로 인용", () => { const csv = churchListCsv({ seasonId: "active", seasonName: "2027 겨울캠프", rows: [{ sido: "미입력/미분류", sigungu: "—", churchName: "=1+1", managerName: "홍길동", phone: "01012345678", peopleCount: 2 }] }, "KST"); assert.ok(csv.includes('"\'=1+1"')); });
   test("교회 4곳의 기존 인원 2명씩은 표시 합계 8명, 원본 불변", () => {
     const list = buildRegionChurchList("active", "2027 겨울캠프", [], [reg("1", null), reg("2", null), reg("3", null), reg("4", null)].map((r) => ({ ...r, head_count: 2 })), []);
     const before = JSON.stringify(list);
     assert.deepEqual(churchListSummary(list), { churchCount: 4, peopleCount: 8 });
     assert.equal(JSON.stringify(list), before);
   });
   test("빈 목록은 교회와 인원 모두 0", () => { assert.deepEqual(churchListSummary({ seasonId: "active", seasonName: "2027 겨울캠프", rows: [] }), { churchCount: 0, peopleCount: 0 }); });
   test("복사는 탭 구분 8열, 쉼표가 든 이름은 한 셀, CSV는 쉼표 유지", () => {
     const list = buildRegionChurchList("active", "2027 겨울캠프", [], [{ ...reg("1", null), head_count: 8, church_name: "교회,이름" }], []);
     const tsv = churchListClipboard(list, "KST").split("\r\n");
     assert.equal(tsv[2].split("\t").length, 8);
     assert.equal(tsv[3].split("\t").length, 8);
     assert.equal(tsv[3].split("\t")[4], "교회,이름");
     assert.equal(tsv[1], "확정 교회 1곳 · 신청 인원 8명");
     assert.ok(churchListCsv(list, "KST").split("\r\n")[2].includes('\",\"'));
   });
   test("탭·개행·따옴표가 든 셀과 수식은 복사에서도 안전하게 인용", () => {
     const list = buildRegionChurchList("active", "2027 겨울캠프", [], [{ ...reg("1", null), church_name: '이름\t"교회"\n지점', manager_name: "=1+1" }], []);
     const tsv = churchListClipboard(list, "KST");
     assert.ok(tsv.includes('"이름\t""교회""\n지점"'));
     assert.ok(tsv.includes("\t'=1+1\t"));
   });
});