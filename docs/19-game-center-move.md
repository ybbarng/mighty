# 19. game.byb.kr로 옮기기 (2026-10-28)

[18](./18-game-center-plan.md) 6절의 1단계. 결정은 18의 7절(주소 `game.byb.kr`, 하트도 목록에 보임, 첫 공개 게임 오목).

## 지금

| 것 | 지금 | 옮기면 |
|---|---|---|
| 첫 화면 `/` | 마이티(`MightyApp`) | 게임 목록 |
| 마이티 | `/` | `/mighty` |
| 하트 | `/hearts`, 마이티 시작 화면에서 풀어야 보임, 검색 제외 | `/hearts`, 목록에 보임 |
| 공용 화면 | `/profile`(내 기록) `/review`(복기) `/security` `/learn` | 그대로 |
| 초대 링크 | 지금 주소 + `?room=&k=` (`net/session.ts` `inviteUrl`) | 그대로(`/mighty?room=…`가 된다) |
| 브라우저 저장 | localStorage `mighty-*`·`hearts-*`, IndexedDB `mighty-review` | 사이트 주소별 저장이라 새 주소에서는 비어 있다 |
| 서버 경로 | `mighty.byb.kr` 의 `/`, `/signal/`, `/diag`, `/turn-credentials` (servers 저장소 앱 넷) | `game.byb.kr` 로 |
| DNS·인증서 | `*.byb.kr` 와일드카드 레코드가 이미 있다. 인증서는 Traefik이 처음 요청 때 받는다 | 할 일 없음 |

## 꼭 지킬 것

- **돌린 초대 링크·QR이 깨지지 않는다.** `mighty.byb.kr/?room=X&k=Y` → `game.byb.kr/mighty?room=X&k=Y`, `mighty.byb.kr/hearts?…` → `game.byb.kr/hearts?…`.
  같은 주소 안에서도 `/?room=`으로 들어오면 `/mighty?room=`으로 넘긴다.
- **내 기록·복기·설정·튜토리얼 진행이 사라지지 않는다.** 아래 "기록 옮기기".
- 옮기는 동안 두 주소 모두에서 게임이 된다(신호 서버가 두 출처를 다 받는다).

## 기록 옮기기

`game.byb.kr`과 `mighty.byb.kr`은 같은 사이트(`byb.kr`)라, `game.byb.kr` 안의 숨은 iframe으로 `mighty.byb.kr/export.html`을 열면
브라우저가 저장소를 나누지 않고 옛 기록을 읽을 수 있다.

1. `game.byb.kr`을 처음 열 때(옮김 표시가 없으면) 숨은 iframe으로 `https://mighty.byb.kr/export.html`을 연다.
2. export 페이지는 localStorage의 `mighty-*`·`hearts-*`와 IndexedDB `mighty-review`를 읽어 `postMessage`로 부모에게 보낸다.
   받는 쪽 출처가 `https://game.byb.kr`일 때만 보낸다.
3. 받은 쪽은 자기 저장소에 같은 키가 없을 때만 넣고(새 주소에서 이미 한 기록을 덮지 않는다) 옮김 표시를 남긴다.
4. 옛 서비스 워커는 export 페이지가 등록을 푼다.

대안: 주소 조각(#)에 담아 넘기기는 복기 기록이 커서 안 된다. 사용자가 파일로 내보내고 가져오기는 손이 많이 간다.

## 순서

| 단계 | 할 일 | 저장소 | 사용자 확인 |
|---|---|---|---|
| A1 | 게임 등록부, 첫 화면 게임 목록, 마이티를 `/mighty`로, `/?room=` 넘기기, 하트 숨김 풀기, 화면 시험 주소 고치기 | mighty | — |
| A2 | 게임 센터 이름·아이콘·manifest(마이티 이름은 마이티 화면에만) | mighty | 이름 |
| B | export 페이지(옛 주소에서만 쓰임)와 가져오기 | mighty | — |
| C1 | `game.byb.kr`에도 앱·`/signal/`·`/diag`·`/turn-credentials`를 붙이고 신호 허용 출처에 더한다. gatus 확인 주소 | servers | 서버 반영 |
| C2 | 앱 기본 주소(`NEXT_PUBLIC_SITE_URL`, 신호 주소)를 `game.byb.kr`로 | mighty | — |
| C3 | `mighty.byb.kr`은 `/export.html`만 남기고 나머지를 같은 경로·물음표 그대로 `game.byb.kr`로 301 | servers | 서버 반영 |
| D | 문서·README·보안 설명의 주소, 컨테이너 이름 정리, (나중) 저장소 이름 | 둘 다 | 저장소 이름 |

A1·A2·B는 `mighty.byb.kr`에 먼저 배포해도 해가 없다. C3 전까지는 옛 주소가 그대로 돈다.
