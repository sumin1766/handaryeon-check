// 삭제 명단 휴지통 — 순수 모듈. 휴지통 스냅샷은 운영 테이블과 연결이 없는 독립 데이터이며,
// 복구는 스냅샷을 재료로 "새 사전접수(미확정)"를 만드는 것이다.
import { CATEGORY_PEOPLE_MAP } from "./member-categories";

export type TrashKind = "pending" | "confirmed";

export const TRASH_KIND_LABEL: Record<TrashKind, string> = { pending: "미확정", confirmed: "확정" };

export const TRASH_KIND_DETAIL: Record<TrashKind, { title: string; description: string; goes: string[] }> = {
  pending: {
    title: "사전접수 삭제",
    description: "아직 확정하지 않은 사전접수 건만 휴지통으로 보냅니다. 확정된 운영 명단은 그대로 둡니다.",
    goes: ["확정 전 사전접수 건 (교회 정보·담당자·연락처·주소·참석자 명단·예상 회비)"],
  },
  confirmed: {
    title: "접수 명단 삭제",
    description: "확정된 교회·참석자·체크인 명단 전체를 휴지통으로 보냅니다.",
    goes: [
      "접수 명단의 모든 교회 (교회 정보·체크인 기록·결제 기록)",
      "각 교회의 참석자 전체",
      "그 교회와 연결된 사전접수 원본 (확정·재검토 건)",
    ],
  },
};

type SnapMember = { name?: string; phone?: string | null; category?: string; lodging_type?: string };
type SnapReg = {
  registration?: Record<string, unknown>;
  members?: SnapMember[];
};
type SnapPerson = { name?: string; note?: string | null; gender?: string; age_group?: string; lodging?: boolean };
export type TrashSnapshot = {
  kind?: TrashKind;
  church?: Record<string, unknown>;
  people?: SnapPerson[];
  registrations?: SnapReg[];
};

export type RestorePayload = {
  registration: {
    season_id: string;
    church_name: string;
    denomination: string | null;
    manager_name: string;
    manager_phone: string;
    expected_fee: number;
    head_count: number;
    status: "submitted";
    region_sido: string | null;
    region_sigungu: string | null;
    road_address: string | null;
  };
  members: { name: string; phone: string | null; category: string; lodging_type: string }[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** 운영 people 행 → 사전접수 분류 (CATEGORY_PEOPLE_MAP의 역방향). */
export function personToCategory(p: SnapPerson): string {
  const note = (p.note ?? "").trim();
  for (const [cat, m] of Object.entries(CATEGORY_PEOPLE_MAP)) {
    if (m.gender === p.gender && m.age_group === p.age_group && (m.note ?? "") === (m.note ? note : "")) {
      if (m.note || !["유아유치", "초등", "유아초등"].includes(note)) return cat;
    }
  }
  return p.gender === "F" ? (p.age_group === "adult" ? "female_adult" : "female_student")
    : p.age_group === "adult" ? "male_adult" : "male_student";
}

/** 스냅샷 → 새 사전접수 생성 재료. 토큰·교회 연결·체크인은 넣지 않는다(새 등록, 미확정). */
export function buildRestorePayload(snapshot: TrashSnapshot, seasonId: string): RestorePayload {
  const regs = snapshot.registrations ?? [];
  const first = regs[0]?.registration ?? {};
  const church = snapshot.church ?? {};

  let members: RestorePayload["members"] = regs.flatMap((r) =>
    (r.members ?? []).map((m) => ({
      name: m.name ?? "",
      phone: str(m.phone),
      category: m.category ?? "male_student",
      lodging_type: m.lodging_type ?? "none",
    })),
  );
  // 확정 명단은 운영 참석자가 최종 명단이므로 참석자 기록이 있으면 그것을 우선한다.
  if (snapshot.kind === "confirmed" && (snapshot.people?.length ?? 0) > 0) {
    const phoneByName = new Map(members.map((m) => [m.name, m]));
    members = (snapshot.people ?? []).map((p) => {
      const prev = phoneByName.get(p.name ?? "");
      return {
        name: p.name ?? "",
        phone: prev?.phone ?? null,
        category: prev?.category ?? personToCategory(p),
        lodging_type: prev?.lodging_type ?? (p.lodging ? "church" : "none"),
      };
    });
  }

  const fee = regs.reduce((s, r) => s + (Number(r.registration?.expected_fee) || 0), 0);
  return {
    registration: {
      season_id: seasonId,
      church_name: str(first.church_name) ?? str(church.name) ?? "(이름 없음)",
      denomination: str(first.denomination) ?? str(church.denomination),
      manager_name: str(first.manager_name) ?? str(church.contact_name) ?? "",
      manager_phone: str(first.manager_phone) ?? str(church.phone) ?? "",
      expected_fee: fee,
      head_count: members.length,
      status: "submitted",
      region_sido: str(first.region_sido),
      region_sigungu: str(first.region_sigungu),
      road_address: str(first.road_address),
    },
    members,
  };
}
