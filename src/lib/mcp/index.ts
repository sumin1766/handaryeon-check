import { auth, defineMcp } from "@lovable.dev/mcp-js";
import appInfo from "./tools/app-info";
import regions from "./tools/regions";
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";
export default defineMcp({
  name: "my-app-mcp",
  title: "한다련 캠프 접수 페이지 만들기",
  version: "0.1.0",
  instructions: "읽기 전용 앱 정보와 지역 참고 목록 도구입니다. 접수 개인정보·회비·저장 작업은 제공하지 않습니다.",
  auth: auth.oauth.issuer({ issuer: `https://${projectRef}.supabase.co/auth/v1`, acceptedAudiences: "authenticated", requireOAuthClientClaim: true }),
  tools: [appInfo, regions],
});