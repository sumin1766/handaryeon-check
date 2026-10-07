// 교회 지역(시/도 → 시군구 연동 드롭다운 + 도로명 주소) 입력 블록.
import { Input } from "@/components/ui/input";
import { KOREA_REGIONS, SIDO_LIST } from "@/lib/korea-regions";

export type ChurchRegion = { sido: string; sigungu: string; road: string };

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

export function ChurchRegionFields({
  value,
  onChange,
  optional = false,
}: {
  value: ChurchRegion;
  onChange: (v: ChurchRegion) => void;
  optional?: boolean;
}) {
  const list = value.sido ? (KOREA_REGIONS[value.sido] ?? []) : [];
  const sigunguOptions = value.sigungu && !list.includes(value.sigungu) ? [value.sigungu, ...list] : list;
  const req = optional ? "" : " *";
  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="text-sm font-medium">교회 주소{optional ? " (선택)" : ""}</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          aria-label="시/도"
          className={selectCls}
          value={value.sido}
          onChange={(e) => onChange({ ...value, sido: e.target.value, sigungu: "" })}
        >
          <option value="">시/도 선택{req}</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="시군구"
          className={selectCls}
          value={value.sigungu}
          disabled={!value.sido}
          onChange={(e) => onChange({ ...value, sigungu: e.target.value })}
        >
          <option value="">{value.sido ? `시군구 선택${req}` : "시/도를 먼저 선택"}</option>
          {sigunguOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <Input
        placeholder={`도로명 주소${req}`}
        value={value.road}
        onChange={(e) => onChange({ ...value, road: e.target.value })}
        maxLength={200}
      />
    </div>
  );
}
