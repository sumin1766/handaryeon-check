import { test } from "node:test";
import { strict as assert } from "node:assert";
import { feeBreakdown } from "./member-categories";

test("회비 내역은 분류별 요율로 묶고 유아유치 0원 줄도 표시한다", () => {
  const fees = { male_adult: { enabled: true, amount: 20000 }, infant: { enabled: true, amount: 0 } } as any;
  const cats = ["male_adult", "infant", "infant", "infant"];
  const r = feeBreakdown(cats, fees, 20000);
  const adult = r.lines.find((l) => l.category === "male_adult")!;
  assert.equal(adult.count, 1); assert.equal(adult.unit, 20000); assert.equal(adult.subtotal, 20000);
  const inf = r.lines.find((l) => l.category === "infant")!;
  assert.equal(inf.count, 3); assert.equal(inf.unit, 0);
  assert.equal(r.lines.length, 2);
  assert.equal(r.total, 20000);
});
