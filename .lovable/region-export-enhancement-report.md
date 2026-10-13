# 지역 내보내기·대표 별표 보강

## 결과
- 설정 집계 PNG: 집계표 아래에 전국 지도를 연결한 한 이미지. PDF: 기존 집계표 페이지 뒤에 지도 페이지 추가. 지도는 대시보드와 같은 17개 경계, 라벨 위치·리더선, 색상 구간을 재사용하며 합계·범례·미분류·시즌·KST 생성 일시를 포함.
- 설정 팝업에는 지도를 추가하지 않음. 기존 PDF/PNG 옆에 지역별 교회 목록 내보내기 메뉴: PDF / 엑셀(xlsx) / CSV 복사.
- 목록은 동일 확정 교회 단위와 주소 선택 규칙, 설정 표와 동일 시도·시군구 순서, 미분류 마지막. 연결된 교회 인원은 접수 시트·명단의 기존 people 행 수, 미연결 확정 건은 기존 head_count 값 사용. 새로운 신청 인원 합산 없음.
- 목록 조회는 클릭 시만 방식 B 비밀번호·역할 검증, 활성 시즌 내부 결정, SELECT만 실행. 지도 공유 조회에는 담당자 연락처를 추가하지 않음. 총교회 수뿐 아니라 지역별 표 행이 현재 화면과 다르면 내보내기를 중단하고 재조회 요청.
- 대표 ID 보존 규칙은 유지하고 별표 fill을 currentColor/none으로 명시. CSS 채움 클래스 생성 여부와 무관하게 저장된 대표만 채워짐. 대표 지정 데이터 변경 없음.

## 변경 파일·위치
- `src/lib/region-export.ts`: renderMap(지도 Canvas), appendCanvas, exportRegionStats(PDF/PNG 지도 추가), exportRegionChurchList(PDF/XLSX/CSV).
- `src/lib/region-map-layout.ts:4`: 대시보드·내보내기 공유 라벨 geometry.
- `src/components/region-church-map.tsx:28`: 동일 geometry 소비; 지도 숫자·표시 순서 유지.
- `src/lib/region-stats.ts:15`: confirmedRegionUnits로 기존 그룹/대표 주소 선택을 추출; aggregateRegions:34는 같은 단위 소비. 계산 규칙 변경 없음.
- `src/lib/region-church-list.ts:10`: 목록 필드·정렬, :28 XLSX 기록, :31 안전한 CSV 인용.
- `src/lib/region-stats.functions.ts:35`: getRegionChurchList 전용 읽기 함수. 기존 getRegionStats 권한·결과 유지.
- `src/components/region-stats-table.tsx:30–64`: 목록 조회·정합성 확인·세 형식 메뉴, 진행/실패 상태.
- `src/components/church-managers-cell.tsx:79–90`: 기존 디자인 Button 사용, :89 별표 fill 명시.
- `src/styles.css:18–20`: 대표 별표 의미 색상 토큰.
- `src/lib/region-church-list.test.ts`: 7개 목록 규칙 테스트.
- `src/lib/pre-registration-display.test.ts`: 대표가 앞에 있어도 ID 보존 테스트 추가.
- `AGENTS.md`, `roadmap.md`: 구조 규칙·작업 상태. 메모리에 내보내기 요구사항 보존.
- 설정 카드 등록/순서, 중복교회 카드, 명단, 대시보드 집계, 회비 및 저장 함수 변경 없음. 마이그레이션·원본 데이터 쓰기·대표 지정 실행 없음. 패키지 변경 없음.

## 검증
- 28개 규칙 테스트 통과. 확정 5건 → 같은 교회 2건 → 목록·집계 4교회, 미확정·과거 제외, 대표 주소 미입력 처리, 정렬, 기존 people 인원, 대표 ID 양쪽 순서 보존 확인.
- 자동 검사 로그 최신 상태 build OK(2026-10-13 08:58:06 UTC).
- localhost 실제 설정 진입은 비밀번호 화면 확인. 공유 비밀번호 세션이 없어 로그인된 실제 조회→목록 버튼→파일 전체 흐름은 미검증.
- 별도 시험 화면에서 실제 제품 컴포넌트·내보내기 함수로 메뉴 3개, PDF/PNG 클릭 다운로드, 목록 PDF/XLSX 생성, clipboard CSV 복사 확인. 대표 한 줄은 채워짐, 미대표 한 줄은 빈 별표. 390px 넘침 없음, 브라우저 예외 0.
- PDF를 이미지로 렌더링해 집계 2페이지, 목록 1페이지, 긴 교회명 50행 4페이지 전부 육안 확인: 한국어, 반복 머리글, 줄바꿈, 페이지 경계 정상. PNG에서 표 아래 지도, 17개 라벨, 제주·범례 확인.
- 발견·수정: 목록 PDF 상단 여백이 불필요하게 큼 → 상단 기준 배치 수정; 지도 마지막 페이지 번호 누락 → 추가 및 Canvas 좌표 보정. 재렌더링 확인 후 새 잘림/겹침 없음.
- XLSX 읽기 확인: 제목 8열 + 교회 4행, 연락처 문자열 선행 0 보존, 인원수 숫자 2, 수식 오류 0. 계산 수식 없는 원본 값 목록이므로 재계산 불필요. 시각적 열 내용도 확인.
- 적용한 문서 검증 지침: PDF, XLSX.
- 게시하지 않음. 실제 로그인된 설정 목록 내보내기와 접수 시트 별표 확인은 남아 있음.