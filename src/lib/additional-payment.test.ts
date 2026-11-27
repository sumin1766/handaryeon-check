import { describe, test as it } from "node:test";
import { strict as assert } from "node:assert";
import { computeAdditionalPayment, SHOP_URL_CHURCH_LODGING as C, SHOP_URL_NO_CHURCH_LODGING as N } from "./additional-payment";

const base = [{ lodging_type: "church", person_id: "p1" }, { lodging_type: "none", person_id: "p2" }];
const run = (o: Partial<Parameters<typeof computeAdditionalPayment>[0]>) =>
  computeAdditionalPayment({ status: "needs_review", expectedFee: 60000, unresolvedFeeDeltas: [], members: base, ...o });

describe("computeAdditionalPayment", () => {
  it("church lodging added -> idx=15", () => {
    assert.deepEqual(run({ unresolvedFeeDeltas: [20000], members: [...base, { lodging_type: "church", person_id: null }] }), { delta: 20000, total: 60000, shopUrl: C });
  });
  it("non-lodging added -> idx=16", () => {
    assert.equal(run({ unresolvedFeeDeltas: [20000], members: [...base, { lodging_type: "none" }] })?.shopUrl, N);
  });
  it("church + none added -> one url idx=15, total delta", () => {
    const r = run({ unresolvedFeeDeltas: [20000, 20000], members: [...base, { lodging_type: "external" }, { lodging_type: "church" }] });
    assert.deepEqual(r, { delta: 40000, total: 60000, shopUrl: C });
  });
  it("hidden when fee decreased or unchanged", () => {
    assert.equal(run({ unresolvedFeeDeltas: [-20000] }), null);
    assert.equal(run({ unresolvedFeeDeltas: [0] }), null);
  });
  it("hidden for other statuses (reconfirmed / submitted)", () => {
    assert.equal(run({ status: "applied", unresolvedFeeDeltas: [20000] }), null);
    assert.equal(run({ status: "submitted", unresolvedFeeDeltas: [20000] }), null);
  });
  it("falls back to whole roster when added rows unknown", () => {
    assert.equal(run({ unresolvedFeeDeltas: [10000] })?.shopUrl, C);
    assert.equal(run({ unresolvedFeeDeltas: [10000], members: [{ lodging_type: "none", person_id: "x" }] })?.shopUrl, N);
  });
});
