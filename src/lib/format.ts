export const krw = (n: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(n || 0);

export const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n || 0);

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL = ["", "십", "백", "천"];
const BIG = ["", "만", "억", "조"];

export function amountToKorean(amount: number): string {
  if (!amount || amount < 0) return "일금 영원정";
  const s = String(Math.floor(amount));
  let out = "";
  const groups: string[] = [];
  let rest = s;
  while (rest.length > 0) {
    groups.unshift(rest.slice(-4));
    rest = rest.slice(0, -4);
  }
  const total = groups.length;
  groups.forEach((g, gi) => {
    const big = BIG[total - 1 - gi];
    let chunk = "";
    const padded = g.padStart(4, "0");
    for (let i = 0; i < 4; i++) {
      const d = parseInt(padded[i]);
      if (d === 0) continue;
      const unit = SMALL[3 - i];
      const dg = d === 1 && unit ? "" : DIGITS[d];
      chunk += dg + unit;
    }
    if (chunk) out += chunk + big;
  });
  return `일금 ${out || "영"}원정`;
}

export const formatDate = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

const pad = (n: number) => String(n).padStart(2, "0");

export const formatTime = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const formatDateTime = formatTime;

// KST (Asia/Seoul), format: YYYY-MM-DD HH:MM:SS. Returns "-" for empty values.
export const formatKst = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  // sv-SE locale outputs "YYYY-MM-DD HH:MM:SS"
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false });
};

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const kstDateOf = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
};

export const weekdayOf = (iso?: string | null) => {
  const s = kstDateOf(iso);
  if (!s) return "";
  return WEEKDAYS[new Date(`${s}T00:00:00Z`).getUTCDay()];
};

export const weekdayOfDate = (kstDate?: string | null) => {
  if (!kstDate) return "";
  return WEEKDAYS[new Date(`${kstDate}T00:00:00Z`).getUTCDay()];
};

export const eachKstDateBetween = (startIso?: string | null, endIso?: string | null) => {
  if (!startIso || !endIso) return [];
  const start = new Date(startIso + "T00:00:00+09:00");
  const end = new Date(endIso + "T00:00:00+09:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    const kstDate = cur.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    out.push(kstDate);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

export const shortDate = (kstDate?: string | null) => {
  if (!kstDate) return "";
  const [m, d] = kstDate.split("-").slice(1);
  return `${m}/${d}`;
};
