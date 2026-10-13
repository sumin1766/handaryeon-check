import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { KOREA_REGIONS, SIDO_LIST } from "../../korea-regions";
export default defineTool({
  name: "list_korea_regions",
  title: "교회 지역 참고 목록",
  description: "교회 지역 입력에 사용하는 전국 시도 또는 선택한 시도의 시군구 목록을 조회합니다.",
  inputSchema: { sido: z.string().optional().describe("시도 정식 명칭. 생략하면 17개 시도 목록을 반환합니다.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ sido }) => {
    if (sido !== undefined && !SIDO_LIST.includes(sido)) return { isError: true, content: [{ type: "text", text: "등록된 시도 정식 명칭을 사용해 주세요." }] };
    const regions = sido === undefined ? SIDO_LIST : KOREA_REGIONS[sido];
    return { content: [{ type: "text", text: regions.join(" · ") }], structuredContent: { regions: [...regions] } };
  },
});