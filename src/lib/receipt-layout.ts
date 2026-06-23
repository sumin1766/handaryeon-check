import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const RECEIPT_CANVAS = { width: 760, height: 1000 };

export type ReceiptElementId =
  | "title"
  | "recipient"
  | "statement"
  | "table"
  | "date_footer"
  | "org_footer";

export type ElementPos = { x: number; y: number; w: number };
export type ReceiptLayout = Partial<Record<ReceiptElementId, ElementPos>>;

export const RECEIPT_ELEMENTS: { id: ReceiptElementId; label: string; default: ElementPos }[] = [
  { id: "title",       label: "제목",          default: { x: 180, y: 40,  w: 400 } },
  { id: "recipient",   label: "수신처",        default: { x: 40,  y: 150, w: 680 } },
  { id: "statement",   label: "본문",          default: { x: 40,  y: 200, w: 680 } },
  { id: "table",       label: "내역표",        default: { x: 40,  y: 260, w: 680 } },
  { id: "date_footer", label: "날짜",          default: { x: 40,  y: 580, w: 680 } },
  { id: "org_footer",  label: "발신처(고정)",  default: { x: 40,  y: 680, w: 680 } },
];

export const DEFAULT_LAYOUT: ReceiptLayout = Object.fromEntries(
  RECEIPT_ELEMENTS.map((e) => [e.id, e.default]),
) as ReceiptLayout;

export function getPos(layout: ReceiptLayout | undefined, id: ReceiptElementId): ElementPos {
  return layout?.[id] ?? DEFAULT_LAYOUT[id]!;
}

export function useReceiptLayout() {
  return useQuery({
    queryKey: ["receipt_layout"],
    queryFn: async (): Promise<ReceiptLayout> => {
      const { data } = await supabase.from("receipt_layout").select("layout").eq("id", 1).maybeSingle();
      return (data?.layout as ReceiptLayout) ?? {};
    },
  });
}

export function useSaveReceiptLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (layout: ReceiptLayout) => {
      const { error } = await supabase
        .from("receipt_layout")
        .upsert({ id: 1, layout: layout as any, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receipt_layout"] }),
  });
}
