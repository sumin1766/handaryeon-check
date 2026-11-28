# Approved OCR/parser authentication only (no publishing)
- [x] Patch only verifyStaff/status adapters; 41 security tests and Deno check passed; both functions deployed, live missing/invalid probes returned 401, automatic build OK.
- [x] Present unapproved full single-registration trash/restore SQL, live FK audit and confirmation lock/note tradeoffs; no DB/application-stage changes applied.
- [ ] Verify real valid-password OCR/parser success — blocked: no shared-password session available; paid API not invoked.
- [ ] Apply stages 2/3 — blocked: explicitly unapproved; note-storage alternative and isolated SQL verification need approval/review.

# Session and menu loading (no publishing)
- [x] Revalidate stored sessions before rendering private screens and clear both query caches on lock.
- [x] Load menus with two retries, season-local fallback and server-success-only editing.
- [x] Reject dashboard read failures before caching; 109 file-isolated tests, automatic typecheck/build and 1440/572px mock checks passed (session scenarios, fallback/save block, dashboard retry, public apply/token bypass).
- [ ] Verify real shared-password session and persisted menu settings — blocked: no app-specific password session supplied; no publishing or operational writes permitted.

# Regional church visualization
- [x] Fix shared address fallback for merged confirmed churches and list summary wording; 34 tests and isolated PDF/XLSX/clipboard checks passed, actual source address/2 people verified read-only.
- [x] Add list-export totals from existing row counts and Excel-friendly TSV clipboard; preserve comma-separated CSV serialization.
- [x] Run 32 tests and browser PDF/XLSX downloads + clipboard parsing (4 churches, 8 people); document changed locations and real Excel paste limitation.
- [x] Add OAuth-protected MCP reference tools, consent/login and browser navigation tools without changing shared-password permissions.
- [x] Extract MCP manifest; 30 tests, unauthorized 401, metadata 200 and consent/login screens verified.
- [ ] Verify real OAuth approve/deny and authenticated tool calls — blocked: no account-auth users exist; camp shared passwords are not OAuth accounts.
- [x] Include shared dashboard map below summary table in PDF/PNG exports.
- [x] Add confirmed church-list PDF/XLSX/clipboard CSV with shared grouping and existing attendee counts.
- [x] Fix filled primary star after exact manager deduplication; 28 rule tests and isolated browser export checks passed.
- [ ] Verify signed-in settings church-list read→export and intake primary star — blocked: app-specific shared-password session unavailable; ordinary auth session does not unlock this gate.
- [x] Add duplicate summary using shared confirmed church total; preserve existing cards.
- [x] Deduplicate exact name/phone intake display only, retaining primary and source counts.
- [x] Run 20 rule tests, verify isolated desktop/mobile displays, and confirm live database 5−4=1; report changed locations.
- [ ] Verify signed-in pre-registration/intake screens end-to-end — blocked: shared-password session unavailable in the sandbox.
- [x] Add read-only active-season regional aggregation and rule tests.
- [x] Add province map with labels, leaders, adaptive legend and unknown count.
- [x] Add settings table and PDF/PNG export with season/time.
- [x] Verify isolated desktop/mobile views, PDF/PNG and database count; document results and changed files.
- [ ] Verify signed-in dashboard/settings read and download end-to-end — blocked: this app uses a shared-password session, unavailable in the sandbox.- [x] Apply form: "명단 전체 삭제" neutral until any name/phone entered.
- [x] Lodgings/places: import from another season into draft, save replaces current season only.
- [x] Admin-only current-season reset card (per item + full, typed-name/password confirm).

# Roster edit page
- [x] Rename to 명단 수정, search, new columns, church detail view/edit/add, fees, per-church name tags, read-only elsewhere.
- [ ] Verify signed-in edit/save end-to-end — blocked: shared-password session unavailable in the sandbox.

# Confirmation Alimtalk (no publishing or live sends)
- [x] Adjust notification badges, failure disclosure and table alignment; 103 existing tests, automatic typecheck/build and 1440/572/390px mocked presentation/resend confirmation checks passed without live sends.
- [x] Add secret-backed authorized single-message sending and additive delivery records with atomic duplicate protection.
- [x] Call after individual confirmation only; show result and confirmed resend control without changing confirmation data.
- [x] Audit current dbGateway callers read-only; notification mocks + 83 existing tests and desktop/mobile mocked flows passed; typecheck/build OK.
- [ ] Verify real staff/admin delivery and actual Kakao/SMS receipt — blocked: live Solapi calls and publishing are explicitly prohibited; no shared-password session supplied.

# Public guide (no publishing)
- [x] Add headings/lists/divider, fixed palette and inline formatting; editor toolbar and live preview with 28 rule tests, 192 total tests and 390/1440 mock checks.
- [x] Match guide to application theme; guide editing opens from existing settings card/dialog layout. Mock card click and 390/1440 guide checks passed; 178 tests and automatic build OK.
- [x] Add server-only season guide table; existing data unchanged.
- [x] Add pure safe parser, public /guide and admin-only settings editor/upload functions.
- [x] Verify 390/1440 mocked guide/editor, authorization/limits, 178 main tests plus 12 isolated checks, automatic build OK.
- [ ] Create public guide image bucket — blocked: public_buckets_blocked persists after reported workspace permission change and retries.
- [ ] Verify real admin save/upload readback — blocked: no shared-password session; bucket unavailable, no operating writes allowed.
