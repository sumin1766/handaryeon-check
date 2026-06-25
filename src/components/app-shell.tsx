import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  UserPlus,
  Building2,
  Tag,
  Bath,
  ReceiptText,
  Settings,
  AlertCircle,
  Lock,
} from "lucide-react";
import type { ReactNode } from "react";
import { useActiveSeason } from "@/lib/use-active-season";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { PasswordGate } from "@/components/password-gate";
import { useAuthRole, setAuthRole } from "@/lib/use-auth-role";

const TABS = [
  { to: "/", label: "대시보드", icon: LayoutDashboard, allowEnded: true, adminOnly: false },
  { to: "/pre-registration", label: "사전접수", icon: ClipboardList, adminOnly: false },
  { to: "/intake-sheet", label: "접수시트", icon: CheckSquare, adminOnly: false },
  { to: "/onsite", label: "현장접수", icon: UserPlus, adminOnly: false },
  { to: "/lodgings", label: "숙소배치", icon: Building2, adminOnly: false },
  { to: "/nametags", label: "이름표 출력", icon: Tag, adminOnly: false },
  { to: "/bath-coupons", label: "목욕쿠폰", icon: Bath, adminOnly: false },
  { to: "/receipt", label: "영수증", icon: ReceiptText, adminOnly: false },
  { to: "/settings", label: "설정", icon: Settings, allowEnded: true, adminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PasswordGate>
      <AppShellInner>{children}</AppShellInner>
    </PasswordGate>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { season, isEnded } = useActiveSeason();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useAuthRole();
  const isAdmin = role === "admin";
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              한
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                한다련 캠프 접수 관리
              </div>
              <div className="text-sm font-semibold leading-tight">
                {season ? season.name : "시즌 미설정"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {season && (
              <div className="hidden md:flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 tabular-nums">
                <span className="text-muted-foreground">접수기간</span>
                <span className="font-medium">
                  {formatDate(season.start_date)} ~ {formatDate(season.end_date)}
                </span>
                {isEnded && (
                  <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                    종료됨
                  </span>
                )}
              </div>
            )}
            <span className="hidden sm:inline rounded-md border bg-muted/40 px-2 py-1 text-[11px] font-medium">
              {isAdmin ? "전체관리자" : "일반 사용자"}
            </span>
            <button
              type="button"
              onClick={() => setAuthRole(null)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
              title="다시 잠금"
            >
              <Lock className="h-3 w-3" />
              잠금
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-[1600px] px-3">
          <ul className="flex flex-wrap items-center gap-0.5">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const isActive = pathname === t.to;
              const disabled = isEnded && !("allowEnded" in t && t.allowEnded);
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={(e) => disabled && e.preventDefault()}
                    className={cn(
                      "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                      disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {!season && (
        <div className="mx-auto max-w-[1600px] px-6 pt-6">
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <div className="font-semibold">활성 시즌이 없습니다.</div>
              <div className="text-xs mt-0.5">
                <Link to="/settings" className="underline">
                  설정
                </Link>
                에서 시즌을 먼저 생성하세요.
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
    </div>
  );
}

export function GenderBadge({ gender }: { gender: string | null }) {
  if (gender === "M")
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: "var(--gender-male-bg)", color: "var(--gender-male-fg)" }}>
        남
      </span>
    );
  if (gender === "F")
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: "var(--gender-female-bg)", color: "var(--gender-female-fg)" }}>
        여
      </span>
    );
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      미지정
    </span>
  );
}
