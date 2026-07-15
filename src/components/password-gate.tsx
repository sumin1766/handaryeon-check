import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { useAuthRole, setAuthRole } from "@/lib/use-auth-role";
import { verifyPassword } from "@/lib/auth-config";

export function PasswordGate({ children }: { children: ReactNode }) {
  const role = useAuthRole();
  const [mounted, setMounted] = useState(false);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (role) return <>{children}</>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const verified = await verifyPassword(pw);
      if (!verified) {
        setError("비밀번호가 올바르지 않습니다.");
        return;
      }
      setAuthRole(verified);
    } catch (err: any) {
      setError(err?.message ?? "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 sm:px-6 py-10">
      <Card className="w-full max-w-[460px] sm:max-w-[520px] rounded-3xl p-6 sm:p-10 lg:p-12 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 items-center justify-center rounded-full bg-primary/10 text-primary mb-4 sm:mb-5">
            <Lock className="h-7 w-7 sm:h-9 sm:w-9 lg:h-10 lg:w-10" />
          </div>
          <h1 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold leading-tight">한다련 캠프 접수</h1>
          <p className="text-base sm:text-[17px] lg:text-[18px] text-muted-foreground mt-2">비밀번호를 입력해 주세요.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">
          <div className="space-y-2">
            <Label htmlFor="pw" className="text-sm sm:text-base">비밀번호</Label>
            <Input
              id="pw"
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              className="h-12 sm:h-14 text-base sm:text-lg px-4 rounded-xl"
            />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <Button
            type="submit"
            className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold rounded-xl"
            disabled={loading || !pw.trim()}
          >
            {loading ? "확인 중..." : "잠금 해제"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

