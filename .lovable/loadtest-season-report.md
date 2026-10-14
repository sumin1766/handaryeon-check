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


## 대용량 확장 (2026-10-14)
- 기존 20곳 유지(이름을 `__LOADTEST_교회_001~020`으로 3자리화, 토큰 불변) + 신규 120곳(`_021~_140`) = **교회 140곳**
- **총 인원 2,900명** (people 2,900 = pre_registration_members 2,900, person_id 연결). 신규 교회당 20~28명, 전체 평균 20.7명
- 확정 사전접수 140건(status applied, church_id 연결), 토큰 140개
- 지역: 17개 시/도 각 7~9곳, 미분류 8곳(i%15=0 신규 교회). 숙박 유형 1/3 'church'
- 시/도 분포(교회/인원): 서울 8/152, 부산 9/173, 대구 8/149, 인천 9/191, 광주 7/145, 대전 8/167, 울산 7/144, 세종 8/171, 경기 7/147, 강원 8/171, 충북 7/145, 충남 8/167, 전북 7/140, 전남 8/167, 경북 8/167, 경남 7/144, 제주 8/170, 미분류 8/190

신규 데이터도 모두 season_id로 연결되어 위 시즌 삭제 쿼리 하나로 연쇄 삭제됨(churches/pre_registrations → people/members CASCADE).
삭제 후 추가 검증:
```sql
SELECT count(*) FROM public.people WHERE name LIKE '__LT참석자%';                 -- 0
SELECT count(*) FROM public.pre_registration_members WHERE name LIKE '__LT참석자%'; -- 0
```

### 전체 토큰 (140, 교회명 순)
```text
j1rnyONLIcB9qjAtLBqFo9sZ
BhbN5DDvnBVIcJB1WUrft6K6
wdBpbAQjAJrUcRbprJ4z7G0A
t2D7JVrer5TgBdiqZNucR3mJ
ngeJqUFO8is8SQNwbwDZkqsZ
VKxPeiGM05udBQINAGBQYS6f
GIlSRSJuTLlVpIg1UYCKX0iW
97KFX4qO6BDMWyHrf15mZ1z7
BMEtFAZy7p4iAUE56HOReiyq
karPgawVgLTBGQhMnTv7CmYj
eScUtgr85j8nrD4tPzLu7qlt
ieUAjlxbrlNR8oboCjUBOUeU
c0EsTnGJf9gwSRWUXjh1nBQ9
amwk7GPDfueDXPiiYXgkcT4P
7kRy8g4VXNoRn9PgqguP0nAC
yvRaBPgdEJBU22rgzdEqBWdq
8KtdA9isdbBNEF2y749a4c8f
cIujIHlyYLIO3MnjH9599Si6
3iq5m02mkPMauWaA3hiXdNFS
fxTguFU68Y5DcAk2B2aDTPjK
LCT35yFc4ntuaSBvfaBf3vh9
48FoNe2mN18cvMPmx0UrY8KP
ORvcu2ZwjSBv9WConPQHqdY5
cMJd60rB4BWumt3sDteXBv0l
W1TFSbiskFcMg4oVEjo7lNQb
BKZqkXvgQlh2LYMKxeyqnOik
7PwpCEJciJulTTTNaghjNUst
JyUmsOaSllkjisJ4TTzPXoxy
kJqkpzntjtIzuPLohxrVDLxx
cSVfAb1LOzAXSrMAxXl8eS5f
X4mzUM84kHBJoUl172oFIOd9
hmDp1tceP3iB6v3qBtEeeKfA
BBVA1rZwARBJl4QaAryBhI10
tMNhkrJjJzBEtR6JxeREXzwc
n0d3NEkVTdCSGnZ6N5uc6fu7
MppWK5TrohonRw4Vl81Kb2HB
S22OUrYKn84m9bWP4EqH6kjo
lNervAikPgTNN0K14nldfQjB
yJDCrAH7BPC780wQaxmCzXuU
buwnMd9PuA3dn6tbyRiKq6kM
ZQSEmFdL9gIoOOHk8sPGVHbX
8XC1btfmYB1yy9xxe9VnmNAM
qV7F1IJknnxZ1VOWGQLGXN6w
FrM5IM4m9KMx4WyaAUp0dVIl
XDM8UCgAxCPqBidiBXAguCgl
EBt03QWu8z3RpJvYThy9cBbS
ie6ingPP72Wgyz9xMzyhBNz2
0JgaqK05oBfJZfqI9pbJUTl2
j5NZmvUCuqTKRQtQj7NVAIcy
VwUnEMPgzrFDFVuzlIZ4E4yP
HtrYoOpxpw2JcrpCjuzKnUkg
fYbkjAgr60UQ0DOKXztQMjeu
IYZB7bolumQ5xvZ7f6XiGYeo
1OlgFABq0fLly3qmdViQcain
zAWNWTwdcrE2JjRVs1FsNYgi
WjOEpZTXiuZlnBokuSfrhNhV
nCF16BAoKPMcfgVLp3pavYRF
YBhk1SeNCSgE8lnUOZpKduN5
Uaj98q8ypDO7fJDAGSeB5feb
AxLgrmyYeqtJ7mf8kCnZluvv
Axp6VmyI2pq2jGVBQF0LjkBb
usNZUEI4YOv83vXwCbFJEEFO
E87HeaxSoouUzJqhPcq0WEWW
g88K6ZNbnTaPZT8RNIx6xvz6
Jw7I8CA4vRcXsBzkz8LA5xYb
DPd1FQYBdfhLSbA8pzX870SC
yRG91jtv9wJA3ROcCVAtupEY
32fsZ2qudZf5lKIi3y9PXteu
MFV2wNK7i5yr07LeVBkglVvt
l3tVAT8g4QpY16yawdopJDkL
sBvG1xwUheYZ2oq3TCX804uJ
gRGX6AahMhZB5zGbqF2zw6ol
H9buZaLL0p4dSToNZZhLTAYJ
U4Dks8Y9YxJ4qt1BSkiF5nBZ
ftPRBASBwtsYM1c5WZs5oMH1
F7RPefvtUXjiQMH7PnIgQeHQ
BUrJtTQfbP2Dz3RCRmAziI2V
bF1L7prSV3vRqtBKulkPKABd
qwoA3azTmGHOU5VNHnUbRDkd
6J3I3ZVmZaMPShrLhfs3VYvK
BBl1rsdkMuujxhazqFmIzZ1w
C45qBtNhBOYBWihl4tZTfZdI
tHPk83Dsi4PzHfYPi8Ngmw07
HQBS8ArUB9GrPVTGimv7ZizH
tfdFL02IbNPdj8B9WasGbRM5
0xrFyZPUY3DZIASE41mB0yiY
o1XGoT88aAzHBy31oVzxnkBW
9kuJAMcCuIPVFhLWROrsqf4U
ynB9F9cZtshxWqH1ztVIXrAn
lArB4nwuUvhAQTDRMn8tLMRO
YAqUSqLO4AjvTm8mj56TYDrE
B4JA3Z8BviMrEGuYDrrlBq2H
ijqTfLzVRsJfD3N8U7jUXbRm
skVQ1efRhw2PHjNyWyZDsDsp
li0AwpEYdmSNe6bTrHzi4Nuw
ViilIa3xBz1G5l2fNc8oPJrM
bfSu4CCUKwxgRKXWy8epBwYv
e9RxBRqvIzVCrCFs8WSlrBbD
M44ekQwpqGRiYVaNTHB8MP9h
lkTMzFHkWJD5WAnt3LxJTa2O
0j9ipGCtFpFGAugzvvciyD3K
hPd5gMwXrpVrKVVc58hPKnae
xRNCdrHAQ7afyZu928wwE922
brLQIzVc7c0JBZq6fvmxx7N0
RgmZnc0s1EsoOBP0snqw6JUj
sASbyut5CHq9DBIDQApPYnAD
EbJKAN79n6O76sEZafuDaENi
gxxUcI7QOTZ6O0umNKmvecNP
PtsBMW0sx8nNVODAPiyPZfza
HmUubRmb1iRYvPq88Qog2mzy
Vb87bcNnsLAw8WhSiHnABLpl
huClbqSAXZIzDRnNqpc2AxrV
atiSAfxGJUjeP84MuApQ70Qw
CqsMtpn6HAVHGHwWOMz5qvdg
ePDohAAMmhsvCa9QdcmhjbbC
LgM04SXgXVZn4izWzBnBxnrB
gP6hjshs7PcpG179vc3VwMWE
xHAYEnLtCHxmROZYmAJtARoU
mAnPB9bsY8qB8iIb7CYVSZ0y
iFYncLUZOYJ065ibXucgApVE
N3UHP5l7Fi6vCAdNqLzQXF6R
q6xVvB9SNFO20BFa4uhggYGc
YOEAX2d4AW73Kw2eH6xjKegX
BfAxxYU4AJCJdZcn8Q2wd49J
S1OviQ6oBGAkK5qWO8Ab1LOB
89WTmeAYELi4dDTM5QLCADyT
UD9j4MYZUXwREBVY0JVmY3Kj
M9lf6sKBoIQBU1FjGxb6ajNG
kSBMYkmAUBDz5NGZmxooK9f3
SsbeUoGrKa4swIoPxkrbx04H
0hhCAHM57wiJ1sPnoIfFtpgw
5BWYSDoFrBwm1tPb6X8aDjZi
LM1iAkhaj9DMItqKbfpsn6DW
4c3aEBuCf54516sH10VwTqNJ
KgBAa5ga7cO2uWlooUh8RgO9
UB9DgjOmdJfRbLAFI5c03u2S
L1ej1CyKNe1wuVcuSaqfmgsU
Io7acaQrcX5Ajz5Nnol4KRMn
IfHH5Z4B4JJVq8q28HOnRLy6
QNTLejDa45GZjBOlG9NE4AFi
```

### 전체 church_id (140, 교회명 순)
```text
01c48ab1-699a-4457-a2ad-d77018a13a89
b1c0bb62-1577-4e9c-b289-2faf47b84265
dacf36da-8766-460a-a0ab-2a5c5cab1ad8
9d4164c3-e3d3-4420-828f-a3c15cdbc230
37d39870-4edb-465b-8a5c-a7dd1d9a8a8a
99e4c665-d7d8-4245-8918-dd89fa727a28
51b2163b-304e-41d8-b1ca-0ed19cb0e400
fa9e62e1-ebf5-46ba-937c-c13e32641ddb
7dc6f0d6-073c-43ba-a5f9-48eb951dc3a6
a31f5708-07e7-4a86-8fef-96d1555890cf
0c02252e-a6ae-4026-bab5-36f80d2b4179
0a003b35-1528-4552-8851-54defa48b4c1
7958957b-c945-468c-bcf1-4908c5c3ac5a
08a5681a-0c17-4a85-bf4a-bae3239d0aec
e8720bf4-4f83-4e9a-b39b-468473f0f422
27c1c0f5-b45e-4999-9695-50c9e326f2bb
a8b71c7b-c111-409b-a18b-dd76974ec77f
1b24baeb-ae29-4c37-8e19-ca0f5e0b0d9c
490c0fab-8ffd-4358-9fe5-7f689b760612
77fec5c2-3baf-46fe-b8f2-c9d7dbbba536
df52d742-e915-4b7b-819a-3c6cf6cef07e
86b9bb84-870b-4113-b721-d5a848e204dd
cf981034-954a-42b2-8194-7e771bc8029a
15695a09-aded-41e8-928b-f5a23fc27473
d90a15b8-81b5-487f-8073-1273ae564b0f
f4ceb573-e24e-480a-aee9-fe419c31ea3e
dae48ab4-5209-4f8f-9d2d-81338c249c5a
a6887bcc-a9ca-461c-b162-ab1c20c20d83
70472cbb-b2e8-474d-aa3e-b9e8658207c7
23970ae2-9e45-4ac9-a78c-4edd3389719e
ae019fec-1fe3-436a-98e5-2c55922fffb9
af30f2f1-09ab-4084-8224-814380e30294
361e03f8-fa55-451f-828a-d6e932d33b55
c0572ebf-bd3d-47cb-9e5c-89f2d0b10dc9
eca244cf-cd3f-4d19-b5a1-657fa8448206
bdd16698-f971-470e-8ac5-bc658d160128
d8136e29-3b47-4da8-b001-87964122a4c2
90b28990-2291-4012-9a29-605f7cd9599d
aa22a419-ffb5-47f0-8c9a-f93208d6a0cd
4c7cdee6-8de9-4776-974e-4f341b730e75
bea975ca-557d-4474-bc07-7427cc6ea26b
836d8d74-9dc2-4055-a48b-d747de7a820e
76b549cb-9aa6-46aa-bf15-b36e04f333a4
ab330ee8-5546-4fad-8b98-195e6bf0d0c9
89daeb8a-144b-491f-8ca0-330e21c32aa0
c6cb79b8-b729-4f0a-b9b2-64784d2a0d15
489e0618-ba2e-42b4-a662-9d6224b98634
c488b0b2-9e15-4978-8caa-7b9ce95ba581
a01b23e7-398b-4f8e-a98f-f806c650f5a1
5d3cb1e4-07fa-4ce5-8cc6-96c9262a4dac
03d6b411-0f74-4a1b-9d38-bd4f3aabd0db
8f248343-c858-4f42-a933-c941d8361cfb
77227301-d0f4-4c26-8215-aeebe5c1ab13
9c2ab418-cbef-411f-bd2f-52fc0b66d8df
8db75311-6a8d-4185-b4a1-89582d4bc34a
6d5e334b-85cc-4ee6-8fae-4c023be930f6
84d4b757-ac43-4a3d-9756-25f0bed9ecf6
fd37757a-a1ff-40ac-bb39-7bfd6b58413f
fa3326c7-ed28-4803-90f7-8010a110120d
04408004-12a7-4110-8493-d831762fd391
eaca594d-1c36-47f5-95ed-38368300ad49
e397716e-392e-4ab2-899f-3ddbc6be04a7
8a54e1e7-9ca0-4ee4-9ddf-7cbec2e7a714
627cc5ae-1f80-4b78-a036-c4d6d385924c
4a4d3fb4-1053-4c64-b97c-c6b8aaea5bd5
b77492df-4dcd-4db2-b7df-e21a6c4b96ec
2add8552-9881-496c-b26f-8230f1dd8200
3932a515-5a74-447c-968e-56363330d63b
bd466011-6aac-474a-bbcb-609e10945dd2
d67e663c-e645-4654-9a4b-fcd97bc91353
e0c8f1a4-b676-429f-9c37-a960143121cf
45ebe66a-0b26-4a9f-824a-8afb8bd10c42
0506ed50-d4d7-4d93-b137-b6a4d9bfe2ac
49e2041a-0f9b-4ae6-8d7e-ca1e822ccaf5
32c751d4-f982-4ea7-bd66-f93ec86933c3
34f8c49f-81da-4290-84cc-9ea9f39b265f
41eb290b-84cf-4a72-adba-77d6cb7f8d9d
1b2f16ed-bf9c-4031-bd39-7c7d76052e60
ac26137d-08e8-4940-a038-eb1984914132
e35e1bd7-6e87-4a53-aafd-283be9d09857
a6ab038d-fdc9-4c17-8715-7a4968ceb30a
abcc38c0-8abc-4cd8-b646-ed31076fcd83
d9b870fa-2aab-4f3c-9d9f-be184d9c6b5a
1b5064d1-1e16-41da-9648-5ba7985d143b
40fff047-ccde-403f-b86e-7de208cc04c5
28f05104-7c58-4db9-a507-88339e18e766
9ad0d1e3-2470-4184-bcd6-1c6afe1d75ac
f1c32829-3478-47cb-9c8f-e5648bb71196
a39406f5-bdda-4673-9615-22ba19dfd2a8
c4bf2e02-4607-4e63-aa4d-bf0ef01988ed
7e9b2bb8-af29-4567-8daf-391b3637e1c0
51e22e53-29e8-4c08-8bf2-5680808794c8
bddf7540-b909-4001-acf3-78f847cc2e84
836fff6d-8e21-40a9-bc36-4bd37b6e306f
e24e099b-8069-408f-905e-9fbcce2ffaa3
13920c25-0153-447f-a894-47b092a6b53e
0ba872de-c3b9-47ed-91bf-d71be801073c
8b4e860d-40e7-4464-b7e8-7f2ceeed0687
d99113f3-d42e-4364-b9a2-87f98b80253d
5bae72db-2010-4de0-9ee1-6d243f608c54
f5be3c62-5b62-445a-bcd2-00328651ae8d
e7deb273-3703-4e92-8d2e-ec1467afbfdc
2881f55e-fbfb-4390-9d51-9f7bca453ec1
4f84c64d-579e-471a-bfb4-b965bbc73cf9
199904a9-ff7c-4098-9ded-615553ca471b
61801ced-3a33-4656-99c6-a2ad6b544776
581cc68c-8bd7-4515-a77f-d9ba2de234c6
7a975038-93a2-47fd-886b-0d08a0b063a2
e0dadb91-2a9e-4d4a-b787-80f225976b86
a003fccf-c091-400e-9af0-917eec604aaa
5b3364c1-4aa2-434f-8ace-76d93220320f
b71f249a-899d-4865-a3af-8e54cad4e4ad
1503acb4-1b1d-4e64-9276-eb7499002bbe
15f4d75d-e35e-4a08-bb5c-6cc680ef07f0
9da4b7fc-1727-4040-a5a5-11433f4f07e9
7d1dcd14-c2e5-49e9-9561-27702db7a0a9
bdf37ea6-a0da-4780-b99e-57fe8ea48eb3
49c0f8bd-951c-4850-a467-075d72cf9459
c5bc9aeb-f6fb-43b4-bb58-eb75fb874040
8904f0be-5327-4180-a98e-aaeeb89d45c1
de802227-240b-445c-8f8c-5403ed09b809
2f2334e1-a4c9-4572-82fc-983b63409581
3f634e40-f24b-46d7-8396-e6e8073cb4ff
85d07741-a049-497e-9b82-489de1de60bd
8ee9ed1d-b918-4f9a-84a0-ac540390244b
dcf97193-6e75-4f68-82be-e0eb4889fa3a
1f2822c9-8c4f-458a-b32e-5038409e020e
a9538d48-8156-4f53-a3fc-0264f2386578
6fd0b65e-5f32-4bcc-bf79-0e4a52fce5fc
10131325-6ad5-402f-aa74-a43ac3e56c58
d608ae98-7766-4f24-8365-0faaf791ed71
566bf001-f0b2-4330-97a3-63e9af526756
083825a9-025a-4799-a341-03ceb08d28ba
7e1e1e6e-48d8-4b5a-940f-bd20ba7bc499
d8b37f7d-110b-4635-b706-84dc95898509
861db7f8-5807-455e-bcb2-94d97d652c00
de0080f7-c167-40cc-983b-b721200406c8
4420ecea-04ac-409f-a351-dab3b39e268a
844b9839-ad6f-4220-ad2f-4a2cda86decc
b102eeea-fe86-449a-85e0-f63110003d1e
```
