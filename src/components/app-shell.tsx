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
  Sun,
  Moon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useActiveSeason } from "@/lib/use-active-season";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { PasswordGate } from "@/components/password-gate";
import { useAuthRole, setAuthRole } from "@/lib/use-auth-role";
import { useTheme } from "@/lib/use-theme";
import logoAsset from "@/assets/handaryeon-symbol.png.asset.json";

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

/**
 * AppShell is now a thin pass-through kept for backwards compatibility with
 * existing route files. The real chrome (header, tabs) lives in AppLayout
 * mounted once at the root, so it survives route navigations and the
 * sliding tab indicator can animate smoothly between any tabs.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PasswordGate>
      <AppLayoutInner>{children}</AppLayoutInner>
    </PasswordGate>
  );
}

function AppLayoutInner({ children }: { children: ReactNode }) {
  const { season, isEnded } = useActiveSeason();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useAuthRole();
  const [theme, setTheme] = useTheme();
  const isAdmin = role === "admin";
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <Link
            to="/"
            className="group flex items-center gap-3 rounded-xl px-1.5 py-1 -ml-1.5 transition-colors hover:bg-muted/60"
            aria-label="대시보드로 이동"
          >
            <img
              src={logoAsset.url}
              alt="한국다음세대훈련원"
              className="h-12 w-12 object-contain"
            />
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground/80">
                한다련 캠프 접수 관리
              </div>
              <div className="text-sm font-semibold leading-tight">
                {season ? season.name : "시즌 미설정"}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-xs">
            {season && (
              <div className="hidden md:flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 tabular-nums">
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
            <span className="hidden sm:inline rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-medium">
              {isAdmin ? "전체관리자" : "일반 사용자"}
            </span>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted/60"
              title={theme === "dark" ? "라이트 모드" : "다크 모드"}
              aria-label="테마 전환"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setAuthRole(null)}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
              title="다시 잠금"
            >
              <Lock className="h-3 w-3" />
              잠금
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-[1600px] px-6">
          <SlidingTabs tabs={visibleTabs} pathname={pathname} isEnded={isEnded} />
        </div>
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

function SlidingTabs({
  tabs,
  pathname,
  isEnded,
}: {
  tabs: ReadonlyArray<(typeof TABS)[number]>;
  pathname: string;
  isEnded: boolean;
}) {
  const containerRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const activeIndex = tabs.findIndex((t) => t.to === pathname);

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const el = itemRefs.current[activeIndex];
      if (!container || !el) return;
      const left = el.offsetLeft;
      const width = el.offsetWidth;
      setIndicator((prev) =>
        prev && prev.left === left && prev.width === width ? prev : { left, width },
      );
    };
    measure();
    const fonts = (document as any).fonts;
    if (fonts?.ready) fonts.ready.then(measure).catch(() => {});
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, tabs.length]);

  return (
    <nav className="relative">
      <ul
        ref={containerRef}
        className="relative flex items-stretch justify-between gap-0"
      >
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const isActive = pathname === t.to;
          const disabled = isEnded && !("allowEnded" in t && t.allowEnded);
          return (
            <li
              key={t.to}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="flex-1"
            >
              <Link
                to={t.to}
                disabled={disabled}
                aria-disabled={disabled}
                onClick={(e) => disabled && e.preventDefault()}
                className={cn(
                  "flex w-full items-center justify-center gap-2 px-3 py-4 text-base font-medium transition-[color,background-color] duration-200 ease-out hover:bg-foreground/[0.04]",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground hover:bg-transparent",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {t.label}
              </Link>
            </li>
          );
        })}
        {indicator && (
          <span
            className="tab-indicator"
            style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          />
        )}
      </ul>
    </nav>
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
