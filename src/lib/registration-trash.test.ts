import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildRestorePayload } from "./registration-trash";

const S = "00000000-0000-0000-0000-000000000001";

describe("registration trash restore", () => {
  const pending = {
    kind: "pending" as const,
    registrations: [{
      registration: { church_name: "은혜교회", manager_name: "홍길동", manager_phone: "01012345678", expected_fee: 40000, status: "submitted", region_sido: "서울특별시" },
      members: [
        { name: "가", phone: "01011112222", category: "male_student", lodging_type: "church" },
        { name: "나", phone: null, category: "female_infant", lodging_type: "none" },
      ],
    }],
  };

  test("restored registration is unconfirmed", () =>
    assert.equal(buildRestorePayload(pending, S).registration.status, "submitted"));
  test("restore never carries an old token or church link", () => {
    const r = buildRestorePayload(pending, S).registration as Record<string, unknown>;
    assert.equal("access_token" in r || "church_id" in r || "paid" in r, false);
  });
  test("restore keeps all members", () => assert.equal(buildRestorePayload(pending, S).members.length, 2));
  test("restore targets the given season", () => assert.equal(buildRestorePayload(pending, S).registration.season_id, S));

  test("confirmed snapshot uses operating attendees as roster", () => {
    const p = buildRestorePayload({
      kind: "confirmed",
      church: { name: "현장교회", contact_name: "김", phone: "01099998888" },
      people: [{ name: "a", gender: "F", age_group: "adult" }, { name: "b", gender: "M", age_group: "student", note: "유아유치" }],
      registrations: [],
    }, S);
    assert.deepEqual(p.members.map((m) => m.category), ["female_adult", "male_infant"]);
    assert.equal(p.registration.church_name, "현장교회");
  });
});

describe("trash is isolated from operating queries", () => {
  test("only trash modules reference the trash table", () => {
    const allowed = new Set(["registration-trash.functions.ts", "types.ts", "registration-trash.test.ts"]);
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !allowed.has(f) && readFileSync(p, "utf8").includes("registration_trash")) offenders.push(p);
      }
    };
    walk("src");
    assert.deepEqual(offenders, []);
  });
});
