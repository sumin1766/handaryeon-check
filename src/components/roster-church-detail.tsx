// 명단 수정 페이지의 교회 상세: 조회 / 명단 수정 / 명단 추가 3개 모드.
// 기존 참석자는 행 단위로 개별 수정(삭제 후 재추가 없음)해 person_id ↔ 사전접수 건 연결을 보존한다.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, Pencil, Plus, Save, Trash2, Undo2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone010Input } from "@/components/phone-010-input";
import { AttendeeExcelBar } from "@/components/attendee-excel-bar";
import { sdb } from "@/lib/secure-db";
import { getSessionPassword } from "@/lib/session-password";
import { recordRegistryEdit } from "@/lib/registry-change-log.functions";
import { notifyDataChanged } from "@/lib/use-realtime";
import { batchColorIndex, lodgingLabel } from "@/lib/change-diff";
import { CATEGORY_LABELS, MEMBER_CATEGORIES, categoryLabel, feeForCategory, isPhoneOptional, type CategoryFeeMap } from "@/lib/member-categories";
import { isPhoneComplete, formatPhone } from "@/lib/phone-format";
import { personToRow, rowToPersonFields, rowsFee, summarizeRosterChange, lodgingCounts, type RosterPerson, type RosterRow } from "@/lib/roster-edit";
import { buildNametagRows, copyText, downloadNametagXlsx, nametagTsv } from "@/lib/nametag-rows";
import type { ChurchManagerInfo } from "@/lib/use-church-managers";
import { krw, formatKst, num } from "@/lib/format";
import { feeBreakdown } from "@/lib/member-categories";
import { FeeBreakdown } from "@/components/fee-breakdown";

type Mode = "view" | "edit" | "add";
const LODGING_OPTIONS = [
  { value: "church", label: "교회숙박" },
  { value: "external", label: "외부숙박" },
  { value: "none", label: "비숙박" },
] as const;
const selectCls = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const focusNext = (sel: string) => setTimeout(() => (document.querySelector(sel) as HTMLElement | null)?.focus(), 0);

let seq = 0;
const newRow = (pre: string | null): RosterRow => ({
  key: `new-${++seq}`, id: null, name: "", phone: "", category: "male_adult", lodging_type: "church", note: "", pre_registration_id: pre,
});
const sameRow = (a: RosterRow, b: RosterRow) =>
  a.name.trim() === b.name.trim() && a.phone === b.phone && a.category === b.category && a.lodging_type === b.lodging_type && a.note.trim() === b.note.trim();

export function RosterChurchDetail({
  church, people, managerInfo, fees, preRegFee, canEdit, seasonName, onBack,
}: {
  church: { id: string; name: string; denomination: string | null };
  people: RosterPerson[];
  managerInfo?: ChurchManagerInfo;
  fees: CategoryFeeMap;
  preRegFee: number;
  canEdit: boolean;
  seasonName: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const logEdit = useServerFn(recordRegistryEdit);
  const [mode, setMode] = useState<Mode>("view");
  const before = useMemo(
    () => [...people].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")).map(personToRow),
    [people],
  );
  const [editRows, setEditRows] = useState<RosterRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [addRows, setAddRows] = useState<RosterRow[]>([]);

  // 병합 교회 건별 색·필터 (접수 명단과 같은 기준)
  const batches = useMemo(
    () =>
      [...(managerInfo?.managers ?? [])]
        .filter((m) => m.status === "applied" || m.status === "needs_review")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.preRegistrationId.localeCompare(b.preRegistrationId)),
    [managerInfo],
  );
  const batchIds = batches.map((b) => b.preRegistrationId);
  const merged = batchIds.length >= 2;
  const [batchFilter, setBatchFilter] = useState("all");
  const colorOf = (id: string | null) => (merged ? batchColorIndex(batchIds, id) : null);
  const visible = (r: RosterRow) => batchFilter === "all" || (r.pre_registration_id ?? "none") === batchFilter;
  const newBatch = batchFilter !== "all" && batchFilter !== "none" ? batchFilter : batchIds.length === 1 ? batchIds[0]! : null;

  const after = mode === "edit" ? editRows.filter((r) => !removed.has(r.key)) : mode === "add" ? [...before, ...addRows.filter((r) => r.name.trim())] : before;
  const summary = mode === "view" ? null : summarizeRosterChange(before, after, fees, preRegFee);
  const viewCounts = lodgingCounts(before.map((r) => ({ lodging: r.lodging_type === "church" })));

  const startEdit = () => { setEditRows(before.map((r) => ({ ...r }))); setRemoved(new Set()); setMode("edit"); };
  const startAdd = () => { setAddRows([newRow(newBatch)]); setMode("add"); };

  const save = useMutation({
    mutationFn: async () => {
      const bad = after.find((r) => r.name.trim() && !isPhoneOptional(r.category) && r.phone && !isPhoneComplete(r.phone));
      if (bad) throw new Error(`${bad.name}: 전화번호 뒤 8자리를 모두 입력해 주세요.`);
      if (mode === "edit") {
        const orig = new Map(before.map((r) => [r.key, r]));
        for (const r of editRows) {
          if (removed.has(r.key) || !r.id) continue;
          if (!r.name.trim()) throw new Error("이름이 비어 있는 참석자가 있습니다. 지우려면 삭제를 눌러 주세요.");
          const o = orig.get(r.key);
          if (o && sameRow(o, r)) continue;
          const { error } = await sdb.from("people").update(rowToPersonFields(r)).eq("id", r.id);
          if (error) throw error;
        }
        const ids = editRows.filter((r) => removed.has(r.key) && r.id).map((r) => r.id!);
        if (ids.length) {
          const { error } = await sdb.from("people").delete().in("id", ids);
          if (error) throw error;
        }
      } else {
        const ins = addRows.filter((r) => r.name.trim()).map((r) => ({
          church_id: church.id, ...rowToPersonFields(r), ...(r.pre_registration_id ? { pre_registration_id: r.pre_registration_id } : {}),
        }));
        if (ins.length) {
          const { error } = await sdb.from("people").insert(ins);
          if (error) throw error;
        }
      }
      const password = getSessionPassword();
      if (password) {
        const asLog = (r: RosterRow) => ({ id: r.id, ...rowToPersonFields(r), pre_registration_id: r.pre_registration_id });
        try {
          await logEdit({
            data: {
              password,
              churchId: church.id,
              before: people.map((p) => ({ id: p.id, name: p.name, note: p.note ?? null, gender: p.gender, age_group: p.age_group, lodging: !!p.lodging, pre_registration_id: p.pre_registration_id ?? null })),
              after: after.map(asLog),
            },
          });
        } catch {
          toast.warning("명단은 저장됐지만 변경 이력 기록에 실패했습니다.");
        }
      }
    },
    onSuccess: async () => {
      toast.success("저장 완료");
      setMode("view");
      notifyDataChanged();
      // 모든 화면(사전접수 관리·접수 명단·대시보드·지역 집계·내보내기)이 운영 명단 최신값을 다시 읽는다.
      await qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: any) => toast.error(e?.message ?? "저장 실패"),
  });

  const tags = buildNametagRows([church], people.map((p) => ({ church_id: church.id, name: p.name })));
  const fileBase = `${seasonName}_${church.name}`;

  const feeTotal = rowsFee(before, fees, preRegFee);
  const setEdit = (key: string, patch: Partial<RosterRow>) => setEditRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAdd = (key: string, patch: Partial<RosterRow>) => setAddRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const origByKey = new Map(before.map((r) => [r.key, r]));

  const batchChips = merged && (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => setBatchFilter("all")}
        className={`rounded-full border px-2.5 py-1 text-xs ${batchFilter === "all" ? "border-foreground font-semibold" : "text-muted-foreground"}`}>
        전체 {num(before.length)}명
      </button>
      {batches.map((b, i) => (
        <button key={b.preRegistrationId} type="button" onClick={() => setBatchFilter(b.preRegistrationId)}
          className={`batch-tint-${i % 8} rounded-full border px-2.5 py-1 text-xs ${batchFilter === b.preRegistrationId ? "ring-2 ring-foreground/60 font-semibold" : ""}`}>
          #{i + 1} {b.name} · {formatKst(b.createdAt)} · {before.filter((r) => r.pre_registration_id === b.preRegistrationId).length}명
        </button>
      ))}
      {before.some((r) => !r.pre_registration_id) && (
        <button type="button" onClick={() => setBatchFilter("none")}
          className={`rounded-full border border-dashed px-2.5 py-1 text-xs ${batchFilter === "none" ? "border-foreground font-semibold" : "text-muted-foreground"}`}>
          건 미지정(수기 추가)
        </button>
      )}
    </div>
  );

  const rowTint = (r: RosterRow) => {
    const ci = colorOf(r.pre_registration_id);
    return ci == null ? "" : `batch-tint-${ci} batch-stripe`;
  };

  const viewTable = (rows: RosterRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
        <thead className="bg-muted/60 text-sm">
          <tr>
            <th className="px-3 py-2 text-right w-12">No</th>
            <th className="px-3 py-2 text-left">이름</th>
            <th className="px-3 py-2 text-left">전화번호</th>
            <th className="px-3 py-2 text-left">분류</th>
            <th className="px-3 py-2 text-left">숙박 유형</th>
            <th className="px-3 py-2 text-left">비고</th>
            <th className="px-3 py-2 text-right">회비</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter(visible).map((r, i) => (
            <tr key={r.key} className={`border-t ${rowTint(r)}`}>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{i + 1}</td>
              <td className="px-3 py-2 font-semibold">{r.name}</td>
              <td className="px-3 py-2 tabular-nums">{r.phone ? formatPhone(r.phone) : "-"}</td>
              <td className="px-3 py-2">{categoryLabel(r.category)}</td>
              <td className="px-3 py-2">{lodgingLabel(r.lodging_type)}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.note || ""}</td>
              <td className="px-3 py-2 text-right tabular-nums">{krw(feeForCategory(r.category, fees, preRegFee))}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">등록된 참석자가 없습니다.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const rowInputs = (r: RosterRow, set: (p: Partial<RosterRow>) => void, idx: number, scope: string, nextSel: string | null) => (
    <>
      <Input placeholder="이름" data-roster-name={`${scope}-${idx}`} value={r.name} onChange={(e) => set({ name: e.target.value })} />
      <select aria-label="분류" className={selectCls} value={r.category}
        onChange={(e) => { set({ category: e.target.value }); focusNext(`[data-roster-phone="${scope}-${idx}"]`); }}>
        {!MEMBER_CATEGORIES.includes(r.category as any) && <option value={r.category}>{categoryLabel(r.category)}</option>}
        {MEMBER_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </select>
      <Phone010Input
        placeholder={isPhoneOptional(r.category) ? "0000-0000 (선택)" : "0000-0000"}
        data-roster-phone={`${scope}-${idx}`}
        value={r.phone}
        onChange={(d) => {
          const was = isPhoneComplete(r.phone);
          set({ phone: d });
          if (!was && isPhoneComplete(d)) focusNext(`[data-roster-lodging="${scope}-${idx}"]`);
        }}
      />
      <div className="flex flex-wrap gap-1">
        {LODGING_OPTIONS.map((o) => (
          <Button key={o.value} type="button" size="sm" variant={r.lodging_type === o.value ? "default" : "outline"}
            data-roster-lodging={r.lodging_type === o.value ? `${scope}-${idx}` : undefined}
            onClick={() => { set({ lodging_type: o.value }); if (nextSel) focusNext(nextSel); }}>
            {o.label}
          </Button>
        ))}
      </div>
      <Input placeholder="비고" value={r.note} onChange={(e) => set({ note: e.target.value })} />
      <div className="self-center text-right text-sm tabular-nums">{krw(feeForCategory(r.category, fees, preRegFee))}</div>
    </>
  );
  const gridCls = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_5rem_auto] items-center rounded-md p-1.5";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />교회 목록</Button>
          <h1 className="text-2xl font-bold">{church.name}{church.denomination && <span className="ml-2 text-base font-normal text-muted-foreground">{church.denomination}</span>}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            전체 {num(viewCounts.total)}명 · 숙박 {num(viewCounts.lodging)}명 · 비숙박 {num(viewCounts.nonLodging)}명 · 예상 회비 {krw(feeTotal)}
          </p>
        </div>
        {mode === "view" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={async () => toast[(await copyText(nametagTsv(tags))) ? "success" : "error"]("이름표 명단 CSV 복사")}>
              <Copy className="h-4 w-4 mr-1" />이름표 CSV 복사
            </Button>
            <Button variant="outline" onClick={() => downloadNametagXlsx(tags, `${fileBase}_이름표.xlsx`)}>
              <Download className="h-4 w-4 mr-1" />이 교회 이름표 출력
            </Button>
            {canEdit && <Button variant="outline" onClick={startEdit}><Pencil className="h-4 w-4 mr-1" />명단 수정</Button>}
            {canEdit && <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1" />명단 추가</Button>}
          </div>
        )}
      </header>

      {batchChips && <Card className="p-3 space-y-1.5"><div className="text-xs font-semibold">신청 건별 보기 <span className="font-normal text-muted-foreground">(같은 색 = 같은 사전접수 건)</span></div>{batchChips}</Card>}

      {mode === "view" && <Card className="p-0 overflow-hidden">{viewTable(before)}</Card>}
      {mode === "view" && before.length > 0 && (
        <Card className="p-3 text-sm">
          <div className="font-medium mb-1">회비 내역</div>
          <FeeBreakdown lines={feeBreakdown(before.map((r) => r.category), fees, preRegFee).lines} total={feeTotal} />
        </Card>
      )}

      {mode === "edit" && (
        <Card className="p-3 space-y-1">
          <div className="text-sm font-semibold mb-1">명단 수정 — 참석자별로 고친 뒤 저장하세요</div>
          {editRows.filter(visible).map((r, i, arr) => {
            const isRemoved = removed.has(r.key);
            const o = origByKey.get(r.key);
            const changed = !!o && !sameRow(o, r);
            const cls = isRemoved ? "bg-destructive/10 opacity-60" : changed ? "bg-accent ring-1 ring-primary/40" : rowTint(r);
            return (
              <div key={r.key} className={`${gridCls} ${cls}`}>
                {rowInputs(r, (p) => setEdit(r.key, p), i, "e", arr[i + 1] ? `[data-roster-name="e-${i + 1}"]` : null)}
                <Button type="button" size="icon" variant="ghost" aria-label={isRemoved ? "삭제 취소" : "참석자 삭제"}
                  onClick={() => setRemoved((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}>
                  {isRemoved ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      {mode === "add" && (
        <>
          <Card className="p-3 space-y-2">
            <div className="text-sm font-semibold">명단 추가{newBatch && merged ? ` — #${batchIds.indexOf(newBatch) + 1} 건에 추가` : ""}</div>
            <AttendeeExcelBar
              onAdd={(list) => setAddRows((p) => [...p.filter((r) => r.name.trim()), ...list.map((m) => ({ ...newRow(newBatch), ...m, note: "" }))])}
              onClear={() => setAddRows([])}
              hasInput={addRows.some((r) => r.name.trim() || r.phone)}
            />
            {addRows.map((r, i) => (
              <div key={r.key} className={`${gridCls} bg-primary/10`}>
                {rowInputs(r, (p) => setAdd(r.key, p), i, "a", addRows[i + 1] ? `[data-roster-name="a-${i + 1}"]` : null)}
                <Button type="button" size="icon" variant="ghost" aria-label="행 삭제" onClick={() => setAddRows((p) => p.filter((x) => x.key !== r.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => { setAddRows((p) => [...p, newRow(newBatch)]); focusNext(`[data-roster-name="a-${addRows.length}"]`); }}>
              <Plus className="h-4 w-4 mr-1" />참석자 추가
            </Button>
          </Card>
          <Card className="p-0 overflow-hidden">
            <div className="px-3 py-2 text-sm font-semibold bg-muted/40">기존 명단 ({num(before.length)}명)</div>
            {viewTable(before)}
          </Card>
        </>
      )}

      {summary && (
        <Card className="p-3 space-y-2 sticky bottom-2 shadow-lg">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">변경 요약</span>
            <span className="tabular-nums">인원 {summary.countDelta > 0 ? "+" : ""}{summary.countDelta}명</span>
            <span className="tabular-nums">회비 {summary.feeDelta > 0 ? "+" : ""}{krw(summary.feeDelta)}</span>
            <span className="text-xs text-muted-foreground"><span className="inline-block h-3 w-3 rounded-sm bg-accent ring-1 ring-primary/40 align-middle" /> 수정 · <span className="inline-block h-3 w-3 rounded-sm bg-primary/10 align-middle" /> 추가 · <span className="inline-block h-3 w-3 rounded-sm bg-destructive/10 align-middle" /> 삭제</span>
          </div>
          {summary.lines.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto list-disc pl-5 text-sm">{summary.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          ) : (
            <div className="text-sm text-muted-foreground">아직 바뀐 내용이 없습니다.</div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMode("view")}><X className="h-4 w-4 mr-1" />취소</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !summary.changed}>
              <Save className="h-4 w-4 mr-1" />{save.isPending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
