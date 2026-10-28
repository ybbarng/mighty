# 19. game.byb.kr로 옮기기 (2026-10-28)

[18](./18-game-center-plan.md) 6절의 1단계. 결정은 18의 7절(주소 `game.byb.kr`, 하트도 목록에 보임, 첫 공개 게임 오목).

사용자 결정(2026-10-28): 지금까지는 사용자 혼자 써 봤으니 **옛 기록은 버리고, 옛 주소·초대 링크도 이어 주지 않는다.**
그래서 기록 옮기기(iframe으로 옛 저장소 읽기)와 `mighty.byb.kr` → `game.byb.kr` 넘겨주기는 하지 않는다.

## 바뀌는 것

| 것 | 전 | 후 |
|---|---|---|
| 첫 화면 `/` | 마이티(`MightyApp`) | 게임 목록(`GameCenterHome`, 등록부 `games/registry.ts`) + 보안 설명·보안 배우기·내 기록 |
| 마이티 | `/` | `/mighty` |
| 하트 | `/hearts`, 마이티 로고를 다섯 번 눌러 찾음, 검색 제외 | `/hearts`, 목록에 보임 |
| 공용 화면 | `/profile` `/review` `/security` `/learn` | 그대로. 기록 화면은 하트 탭이 늘 보이고 `?game=`으로 들어온 게임에 돌아간다 |
| 초대 링크 | 지금 주소 + `?room=&k=` | 그대로(`/mighty?room=…`) |
| 서버 경로 | `mighty.byb.kr` 의 `/`, `/signal/`, `/diag`, `/turn-credentials` (servers 저장소 앱 넷) | `game.byb.kr` |
| DNS·인증서 | `*.byb.kr` 와일드카드 레코드가 이미 있다. 인증서는 Traefik이 처음 요청 때 받는다 | 할 일 없음 |

## 순서

| 단계 | 할 일 | 저장소 | 사용자 확인 | 진행 |
|---|---|---|---|---|
| A1 | 게임 등록부, 첫 화면 게임 목록, 마이티를 `/mighty`로, 하트 숨김 풀기, 화면 시험 주소 고치기 | mighty | — | 끝(`e113ac8`) |
| A2 | 게임 센터 이름·아이콘·manifest(마이티 이름은 마이티 화면에만) | mighty | 이름(나중에) | 끝(`c03bd43`). 이름은 임시 "게임", `SITE` 한 곳만 바꾸면 된다 |
| C1 | servers: 앱 넷의 Host를 `game.byb.kr`로, 신호 허용 출처, gatus 확인 주소. `mighty.byb.kr` 라우터는 지운다 | servers | 서버 반영 | 끝(servers `9fcecb8`·`78b2b28`, PLAN.md 20단계). 2026-10-28 옛 주소는 404 |
| C2 | 앱 기본 주소(`NEXT_PUBLIC_SITE_URL`, 신호 주소)를 `game.byb.kr`로. C1과 함께 배포 | mighty | — | 끝(`2e7ed57`) |
| D | 문서·README·보안 설명의 주소, 컨테이너 이름 정리, (나중) 저장소 이름 | 둘 다 | 저장소 이름 | |
