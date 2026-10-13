import { defineTool } from "@lovable.dev/mcp-js";
export default defineTool({
  name: "get_app_info",
  title: "캠프 앱 정보",
  description: "앱 이름과 지원하는 읽기 전용 참고 도구를 확인합니다.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({ content: [{ type: "text", text: "한다련 캠프 접수 페이지 만들기. 지역 참고 목록을 조회할 수 있습니다. 접수·연락처·회비 데이터는 이 연동에 노출되지 않으며, 기존 앱 비밀번호 권한은 그대로 유지됩니다." }] }),
});