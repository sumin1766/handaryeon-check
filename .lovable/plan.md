
# 한다련 캠프 접수 관리 시스템

수련회/캠프 접수를 시즌 단위로 관리하는 내부용 단일 접근 웹앱입니다. 한국어 UI, ₩ 표기, 정보 밀도 높은 관리자 대시보드 스타일로 구현합니다.

## 기술 스택 / 인프라

- **프론트**: TanStack Start + React + Tailwind v4 + shadcn (이미 셋업됨)
- **백엔드**: Lovable Cloud (Supabase) — 모든 데이터 실시간 동기화 (Realtime 구독)
- **로그인 없음**: 단일 접근. RLS는 anon에 read/write 허용으로 열어둠 (내부망 가정, 사용자 요구사항)
- **상태**: TanStack Query + Supabase Realtime 채널로 모든 탭이 같은 DB 실시간 반영

## 데이터 모델 (Supabase 스키마)

```text
seasons            id, name, start_date, end_date, is_active
churches           id, season_id, name, denomination, contact_name, phone, memo,
                   is_checked_in, checked_in_at, actual_count, source('pre'|'onsite')
people             id, church_id, name, note(학년 등),
                   gender('M'|'F'), age_group('student'|'adult'),
                   lodging(bool), lodging_id(nullable)
lodgings           id, season_id, name, building('교육관'|'본당'|'기타'),
                   floor, capacity, gender('M'|'F'|null), active
bath_coupons       id, season_id, name, qty, paid_transfer(bool), transfer_at,
                   paid_cash(bool), cash_at, weekday, amount
settings           id, season_id, bath_unit_price, ...
receipts (선택)    저장 안 함 - 출력 위주
```

`churches.actual_count`(실접수), `is_checked_in`(접수 체크)는 접수시트에서 관리. 인원 8개 항목은 `people` 테이블에서 `gender × age_group × lodging` 조합으로 집계 (단일 진실 소스).

`lodgings`는 시즌 생성 시 기본 숙소 24개 자동 시드.

## 페이지 구조

상단 가로 탭바: 대시보드 / 사전접수 / 접수시트 / 현장접수 / 숙소배치 / 목욕쿠폰 / 영수증 / 설정. 상단 우측에 활성 시즌명·접수기간 상시 표시. 시즌 종료 후엔 대시보드 외 비활성화(클릭 시 "시즌 종료" 토스트).

### 1. 대시보드
- 사전접수 현황: 교회 수, 총인원, 8개 항목 카드
- 실접수 현황: 체크된 교회 수, 총인원, 사전 대비 ±/% 비교
- 시즌 종료 시에도 직전 시즌 데이터 유지 표시

### 2. 사전접수
- 좌측 textarea 붙여넣기 → 우측 파싱된 미리보기
- **파서는 `src/lib/parsers/pre-registration-parser.ts` 별도 모듈**로 분리 (정규식 기반, 양식 변경 대응)
- 추출: 교회명/교단, 담당자/전화, 8개 항목 숫자, 명단(이름+괄호 비고)
- 검증: 숫자 vs 명단 수 대조, 불일치 시 ⚠️
- 미리보기 수정 가능 → 저장 시 churches + people insert

### 3. 접수시트
- 교회별 행, 사전접수 + 현장접수 모두 표시
- 체크박스(체크 시각 자동), 실접수 인원 입력
- 교회명 옆에 배정 숙소 칩(남=하늘색/여=분홍색/미지정=회색)
- 상단 합계 요약

### 4. 현장접수
- 폼: 교회명/담당자/전화 + 8개 항목 이름 입력칸 (공백·쉼표·줄바꿈 분리)
- 인원 수는 이름 개수 자동 카운트, 합계 자동
- 등록 시 즉시 저장 + 폼 초기화

### 5. 숙소배치
- 상단: 전체 정원/배정/남은자리 요약
- 교육관/본당/기타 그룹 → 층별 가로 배치 카드 그리드
- 카드: 숙소명, 인원/정원, 진행 바, 남/여 색상
- 카드 클릭 → Sheet 패널 열어 명단 작성
  - 이름 입력 시 사전/현장접수 명단 자동완성 (동명이인 후보 표시 → 교회 선택)
  - 없으면 신규 등록 (교회명 직접 입력)
  - 정원 초과 시 빨간 경고(허용)
  - 성별 불일치 ⚠️
- 상단 교회명 검색 → 해당 교회 숙박자 배정 상태 표시 + 미배정자 즉시 배정

### 6. 목욕쿠폰
- 표: 이름, 매수, 입금(체크/시간), 현금(체크/시간), 요일, 금액(자동=매수×단가)
- 요일별 집계 카드 + 전체 집계
- 단가는 설정 페이지에서 변경

### 7. 영수증
- 좌: 문서 양식 미리보기 (인쇄 시 이것만 출력 — `@media print`)
- 우: 입력 폼 + 토글(입금확인서/결제확인서)
- 금액 → 한글(일금 ○○원정) 자동 변환 유틸
- 하단 고정: 한국다음세대훈련원 / 504-82-87922 / 손현보
- 인쇄 버튼

### 8. 설정
- 시즌 관리: 생성/활성 지정/기간
- 숙소 설정: 정원, 활성, 성별(M/F/null), 층/그룹
- 목욕쿠폰 단가
- 이름표 엑셀 다운로드 (xlsxwriter는 서버; 클라이언트는 `xlsx` 패키지로 .xlsx 생성)

## 구현 순서 (사용자 우선순위 반영)

1. Lovable Cloud 활성화 + 스키마 마이그레이션 + 기본 숙소 시드
2. 공통 레이아웃: 탭바, 활성 시즌 컨텍스트, 시즌 가드
3. 설정 페이지 (시즌 생성 필수 선행)
4. 사전접수 파서 모듈 + 사전접수 페이지
5. 대시보드
6. 접수시트
7. 숙소배치
8. 현장접수
9. 목욕쿠폰
10. 영수증

## 디자인 방향

- 정보 밀도 높은 관리자 대시보드: compact 테이블, 숫자 강조 타이포(tabular-nums), 카드 기반 KPI
- 한국어 폰트: Pretendard (CDN <link>)
- 색 토큰: 중립 베이스 + 남자=하늘(sky-500), 여자=분홍(pink-400), 미지정=회색 — `--gender-male`, `--gender-female`, `--gender-none` 세만틱 토큰으로 정의
- shadcn Table/Card/Sheet/Dialog/Tabs 적극 활용

## 메모

- 로그인 없는 단일 접근이므로 `_authenticated/` 안 씀, 모든 라우트 공개
- Supabase는 publishable key로 anon 권한에 SELECT/INSERT/UPDATE/DELETE 부여 (사용자 요구 반영)
- 실시간: 주요 테이블(churches, people, lodgings, bath_coupons)에 Realtime 구독 → invalidateQueries

규모가 커서 1차 PR에서는 **스키마 + 레이아웃 + 설정 + 사전접수(파서) + 대시보드 + 접수시트 + 숙소배치**까지 완성하고, 현장접수·목욕쿠폰·영수증은 후속 작업으로 이어가겠습니다.
