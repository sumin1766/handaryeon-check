// 교회 지역(시/도 → 시군구 연동 드롭다운 + 도로명 주소) 입력 블록.
import { useRef } from "react";
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
  const sigunguRef = useRef<HTMLSelectElement>(null);
  const roadRef = useRef<HTMLInputElement>(null);
  const req = optional ? "" : " *";
  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="text-sm font-medium">교회 주소{optional ? " (선택)" : ""}</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          aria-label="시/도"
          className={selectCls}
          value={value.sido}
          data-autofocus-target="sido"
          onChange={(e) => {
            onChange({ ...value, sido: e.target.value, sigungu: "" });
            // 시/도 선택 즉시 시군구 선택으로 이어지게 (활성화된 뒤 포커스)
            if (e.target.value) setTimeout(() => sigunguRef.current?.focus(), 0);
          }}
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
          ref={sigunguRef}
          onChange={(e) => {
            onChange({ ...value, sigungu: e.target.value });
            if (e.target.value && !value.road) setTimeout(() => roadRef.current?.focus(), 0);
          }}
        >
          <option value="">{value.sido ? `시군구 선택${req}` : "시/도를 먼저 선택"}</option>
          {sigunguOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <Input
        ref={roadRef}
        placeholder={`도로명 주소${req}`}
        value={value.road}
        onChange={(e) => onChange({ ...value, road: e.target.value })}
        maxLength={200}
      />
    </div>
  );
}
