# 에이전트 연동

OAuth 서버 활성화 및 `/mcp` 설정·목록 생성 완료. 아직 게시하지 않음.

## 제공 범위
- 원격: `get_app_info`, `list_korea_regions` 읽기 전용 참고 정보.
- 브라우저(WebMCP): `read_camp_navigation`, `open_camp_menu` — 잠금 해제된 화면의 접근 가능한 메뉴만 사용.
- 기존 공용 비밀번호를 OAuth 권한으로 바꾸지 않으며 접수 개인정보·교회 목록·회비·저장 도구를 노출하지 않음. 원본 데이터·집계·대표 지정·RLS 변경 없음.

## 변경 위치
- `vite.config.ts`: 기존 플러그인 유지, MCP 플러그인 추가.
- `src/lib/mcp/index.ts`, `tools/app-info.ts`, `tools/regions.ts`: OAuth 보호·도구 목록.
- `src/routes/agent-login.tsx`, `[.]lovable.oauth.consent.tsx`: 별도 계정 로그인, 승인/거절, 오류 처리.
- `src/lib/oauth-return-path.ts` 및 테스트: 같은 출처 복귀 경로 검증.
- `src/components/app-shell.tsx`: 승인/로그인 화면은 기존 캠프 공용 비밀번호 화면 밖에 배치; 잠금 해제된 메뉴의 WebMCP 등록.
- `src/lib/webmcp-telemetry.ts`: 도구명·결과·소요 시간만 추적, 입력·개인정보 기록 없음.
- `src/routes/__root.tsx`, `public/favicon.ico`: 기존 로고 앱 아이콘.
- `package.json`, `bun.lock`: MCP SDK·WebMCP 추가, Zod는 기존 3.x 계열 유지(스키마 추출에 필요한 3.25).
- SDK 생성 파일: MCP 라우트·OAuth 메타데이터 및 `.lovable/mcp/manifest.json`.
- `AGENTS.md`, `roadmap.md`: 권한 경계·검증 상태.

## 검증 및 남은 사항
- 30개 테스트 통과(기존 집계/목록/중복표시 28 + 복귀 경로 2).
- 로컬 MCP 비인증 요청 401, OAuth 메타데이터 200, 브라우저 예외 없음.
- 로그인 화면, 요청 ID 누락 오류, 로그인 시 authorization_id 복귀 경로 유지 확인.
- SDK CLI로 manifest 추출 성공. 자동 검사 build OK 확인.
- 실제 OAuth 승인/거절 및 인증 도구 호출은 **미검증**: 계정 인증 사용자가 없어 시험용 세션 발급 불가. 기존 캠프 공용 비밀번호는 별도 계정이 아님. 계정 준비 후 승인/거절 전체 흐름 검증 필요.
- 기존 정책을 MCP용으로 확장하지 않음. 개인 자료 도구 추가 전 기존 계정/RLS와 공용 비밀번호 권한의 연결 기준 승인 필요.
- 생성된 설정은 게시된 서비스 변경의 증거가 아님. 사용 전 다시 게시 필요.