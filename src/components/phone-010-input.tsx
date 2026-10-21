import { phone010FromTail, phone010Tail } from "@/lib/phone-format";

/** 앞자리 "010-" 고정 전화번호 입력. 저장 값은 하이픈 없는 숫자, 뒤 자리가 비면 빈 값. */
export function Phone010Input({
  value,
  onChange,
  placeholder = "0000-0000",
  ...rest
}: {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  [k: `data-${string}`]: unknown;
}) {
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <span className="flex select-none items-center bg-muted px-2.5 text-sm text-muted-foreground">010-</span>
      <input
        {...rest}
        className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
        inputMode="numeric"
        maxLength={9}
        placeholder={placeholder}
        value={phone010Tail(value)}
        onChange={(e) => onChange(phone010FromTail(e.target.value))}
      />
    </div>
  );
}
