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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">한다련 캠프 접수</h1>
          <p className="text-sm text-muted-foreground mt-1">비밀번호를 입력해 주세요.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pw">비밀번호</Label>
            <Input
              id="pw"
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <Button type="submit" className="w-full" disabled={loading || !pw.trim()}>
            {loading ? "확인 중..." : "잠금 해제"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
