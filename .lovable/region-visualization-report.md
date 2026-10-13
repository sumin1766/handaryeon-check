# 지역별 교회 집계 구현 보고

## 구현
- 대시보드: `src/routes/index.tsx`의 기존 섹션 이후 `RegionChurchMap` 추가.
- 설정: `src/routes/settings.tsx`의 제목 아래, 기존 설정 카드 위에 `RegionStatsTable` 추가. 기존 카드 순서 저장 동작 변경 없음.
- 지도: `src/components/region-church-map.tsx`, SVG 17개 시도 경계, 17개 좌우 라벨·연결선, 전국 합계·미분류, 단계 범례. 모바일은 지도와 라벨 목록을 분리.
- 지도 경계: `src/lib/korea-map-paths.ts`, SGIS/vuski/admdongkor 2025.01 데이터 단순화; 군위의 대구 편입 반영. `src/lib/korea-map.LICENSE.txt`에 데이터 이용 조건 보존.
- 표: `src/components/region-stats-table.tsx`, 시도·시군구·교회 수, 소계·미분류·전국 합계와 내보내기 버튼.
- 내보내기: `src/lib/region-export.ts`, 한국어 글꼴이 준비된 뒤 Canvas PNG 생성. PDF는 pdf-lib를 클릭 시 로드하고 A4, 최대 22행/페이지, 제목·시즌·생성시각·머리글 반복. 행은 페이지 경계에서 잘리지 않음.
- 조회: `src/lib/region-stats.functions.ts`, 방식 B 공유 비밀번호 서버 검증, 활성 시즌 내부 결정, SELECT만 실행, 두 목록 모두 500행씩 페이지 조회. 개인정보나 접근 토큰은 반환하지 않음.
- 공유 조회: `src/lib/use-region-stats.ts`, 활성 시즌 전용, 과거 시즌 조회 중 숨김, 기존 실시간 갱신 방식 활용.
- 표시 집계: `src/lib/region-stats.ts`, 연결된 church_id당 1교회; 대표 주소 또는 최초 유효 주소; 대표가 미입력이면 미분류; 기존 미연결 교회 포함; 아직 연결되지 않은 제출은 각각 1교회. 이름 기반 자동 병합 없음.
- 상태: `src/components/region-load-state.tsx`, 오류·다시 조회.
- 색상과 화면: `src/styles.css`, region 의미 토큰·흰색·분홍·빨강·버건디와 모바일 스타일.
- 테스트: `src/lib/region-stats.test.ts`, 병합, 대표, 미분류, 과거 시즌 제외, 합계, 색 구간 11건.
- `package.json`, `bun.lock`: PDF용 pdf-lib 추가. 기존 패키지 버전 변경 없음. 임시 테스트 타입 패키지는 제거함.
- `AGENTS.md`, `roadmap.md`: 구조 규칙 및 검증 상태.
- 모든 기존 콘텐츠 페이지의 head()를 확인하고 누락된 description/OG/type/card만 보완함: bath-coupons, intake-sheet, lodgings, nametags, onsite, places, pre-registration, receipt, registry, rosters, segue-merge. 각 페이지 동작 변경 없음.

## 검증
- 자동 타입 검사·빌드: build OK.
- 집계 규칙 테스트: 11개 통과.
- 실제 자료 읽기 대조: 활성 시즌 2027 겨울캠프, 등록 교회 1개·제출 4건, 같은 교회에 2건 연결 → 새 지역 집계는 3교회. 연결된 교회는 최초 유효 주소인 대구, 미연결 제출은 서울·부산 각 1교회. 기존 대시보드의 등록 교회 수 1개와 참석자 2명 계산은 그대로 유지.
- 별도 격리 화면에서 동일 집계/지도/표 구현을 검증: 17개 지역, 합계 3, 시도 소계 일치, 데스크톱 연결선, 모바일 390px 가로 넘침 없음. 샘플 자료만 사용했으며 실제 서버 조회 흐름을 검증한 것은 아님.
- PDF·PNG 버튼 클릭으로 실제 파일 다운로드 성공. PDF 1페이지 및 52행 3페이지의 모든 페이지를 이미지로 변환하고 육안 확인. 시즌명·KST 생성 일시, 머리글, 행, 페이지 번호 정상. PNG 한국어·합계 정상.
- 검증 중 발견: 검증용 HTML의 UTF-8 누락으로 샘플 한국어가 손상됨 → 검증 응답 인코딩 수정 후 다시 확인. 모바일 제주도가 잘림 → 전용 SVG viewBox로 수정 후 확인.
- 테스트 타입 패키지가 전역 fetch 형식과 충돌 → Node 표준 테스트/단언으로 바꾸고 해당 패키지 제거; 자동 검사 정상.
- 저장·마이그레이션·RLS·회비·참석자 변경 없음. 검증 중 원본 데이터에 쓰기 작업 없음.

## 제한
- 앱은 일반 회원 로그인 대신 공유 비밀번호 세션을 사용함. 이 세션이 도구 환경에 없어 로그인된 실제 대시보드/설정의 서버 조회→화면→다운로드 전 과정을 확인하지 못함. 사용자 로그인 후 이 경로 검증 필요.
- 게시하지 않음.
- 지도는 2025.01 기준 표시용 경계, 시군구 집계는 기존 korea-regions.ts 기준.
- PDF는 한국어 표시 안정성을 위한 이미지 기반 표이며 텍스트 선택/검색은 지원하지 않음.