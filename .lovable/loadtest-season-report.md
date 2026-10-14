# 부하 테스트 전용 시즌 (__LOADTEST_시즌)

- 시즌 ID: `3e9232af-31a4-4e9a-90b3-b5309dcb6c84`, 이름 `__LOADTEST_시즌`, **비활성(is_active=false)**으로 생성
- 생성물: app_settings 1행(기본값), churches 20곳(`__LOADTEST_교회_01~20`, source 'pre'), people 총 50명, pre_registrations 20건(status 'applied', church_id 연결, expected_fee 0), pre_registration_members 50명
- 숙소·장소·목욕권·결제 행은 만들지 않음(people.lodging_id 비어 있음)
- 코드·설정·패키지 변경 없음. 데이터 추가만 수행.

## 토큰 (k6용, 교회 | 인원 | token)
```text
__LOADTEST_교회_01 | 2 | j1rnyONLIcB9qjAtLBqFo9sZ
__LOADTEST_교회_02 | 3 | BhbN5DDvnBVIcJB1WUrft6K6
__LOADTEST_교회_03 | 4 | wdBpbAQjAJrUcRbprJ4z7G0A
__LOADTEST_교회_04 | 1 | t2D7JVrer5TgBdiqZNucR3mJ
__LOADTEST_교회_05 | 2 | ngeJqUFO8is8SQNwbwDZkqsZ
__LOADTEST_교회_06 | 3 | VKxPeiGM05udBQINAGBQYS6f
__LOADTEST_교회_07 | 4 | GIlSRSJuTLlVpIg1UYCKX0iW
__LOADTEST_교회_08 | 1 | 97KFX4qO6BDMWyHrf15mZ1z7
__LOADTEST_교회_09 | 2 | BMEtFAZy7p4iAUE56HOReiyq
__LOADTEST_교회_10 | 3 | karPgawVgLTBGQhMnTv7CmYj
__LOADTEST_교회_11 | 4 | eScUtgr85j8nrD4tPzLu7qlt
__LOADTEST_교회_12 | 1 | ieUAjlxbrlNR8oboCjUBOUeU
__LOADTEST_교회_13 | 2 | c0EsTnGJf9gwSRWUXjh1nBQ9
__LOADTEST_교회_14 | 3 | amwk7GPDfueDXPiiYXgkcT4P
__LOADTEST_교회_15 | 4 | 7kRy8g4VXNoRn9PgqguP0nAC
__LOADTEST_교회_16 | 1 | yvRaBPgdEJBU22rgzdEqBWdq
__LOADTEST_교회_17 | 2 | 8KtdA9isdbBNEF2y749a4c8f
__LOADTEST_교회_18 | 3 | cIujIHlyYLIO3MnjH9599Si6
__LOADTEST_교회_19 | 4 | 3iq5m02mkPMauWaA3hiXdNFS
__LOADTEST_교회_20 | 1 | fxTguFU68Y5DcAk2B2aDTPjK
```

## 활성 시즌 요구 여부 — 요구함
`src/lib/qr-checkin.functions.ts`의 `getCheckinByToken`/`saveCheckin`은 둘 다 `activeSeasonId()`(is_active=true 중 최신 1건)로 시즌을 고정하고 `season_id = 활성 시즌 AND access_token = 토큰`으로 조회한다. 비활성 시즌 토큰은 "해당 접수를 찾을 수 없습니다"로 실패한다. 코드 변경 금지 조건이므로 비활성 상태 테스트 방법은 없다.

### 선택지 A (코드 무변경, 위험 있음): 테스트 중에만 활성 전환
- 앱 설정 > 시즌 관리에서 `__LOADTEST_시즌`을 활성으로 바꾸고, 끝나면 `2027 겨울캠프`를 다시 활성으로 바꾼다.
- 주의: 미리보기와 게시판이 같은 백엔드를 쓰므로, 전환하는 동안 **모든 화면과 공개 /apply가 테스트 시즌을 가리킨다**. 사용자가 없는 시간에만 진행해야 한다.
- 화면 대신 쿼리로 할 경우(데이터 변경 도구로 실행):
```sql
-- 전환
UPDATE public.seasons SET is_active = (id = '3e9232af-31a4-4e9a-90b3-b5309dcb6c84');
-- 복구
UPDATE public.seasons SET is_active = (id = 'b79ddc03-1393-44e3-9a24-fd9ad8438368');
-- 확인: 2027 겨울캠프만 t
SELECT name, is_active FROM public.seasons ORDER BY created_at;
```

### 선택지 B (더 안전, 코드 변경 필요 — 승인 시에만)
서버 함수에 "부하 테스트 시즌 이름이 `__LOADTEST_`로 시작하면 그 시즌의 토큰도 허용" 같은 분기를 넣으면 2027 겨울캠프를 활성으로 둔 채 테스트할 수 있다. 이번 작업 범위(서버 함수 변경 금지) 밖이라 적용하지 않았다.

## 통째 삭제
```sql
DELETE FROM public.seasons
WHERE id = '3e9232af-31a4-4e9a-90b3-b5309dcb6c84' AND name = '__LOADTEST_시즌' AND is_active = false;
```
먼저 활성 시즌을 2027 겨울캠프로 되돌린 뒤 실행한다(`is_active = false` 조건으로 활성 상태면 삭제되지 않음).

연쇄 삭제 확인(외래키 실제 조회):
- seasons → churches, pre_registrations, app_settings, lodgings, bath_coupons: ON DELETE CASCADE
- churches → people, church_payments: CASCADE / pre_registrations → members, changes: CASCADE
- places, segue_merge_log, duplicate_dismissals는 외래키가 없지만 테스트 시즌 행이 없으므로 남는 것 없음
- 모두 이 시즌 ID에 묶인 행만 지워지며, 2027 겨울캠프·2026 여름캠프·다른 시즌 숙소/장소는 대상이 아님

삭제 후 확인:
```sql
SELECT count(*) FROM public.churches WHERE name LIKE '__LOADTEST_%';          -- 0
SELECT count(*) FROM public.pre_registrations WHERE church_name LIKE '__LOADTEST_%'; -- 0
```
