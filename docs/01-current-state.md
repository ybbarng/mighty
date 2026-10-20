# 01. 프로젝트 현재 상태 (2026-10 기준 점검)

## 한눈에 보기

| 항목 | 상태 |
| --- | --- |
| 작업 기간 | 2019-05-08 ~ 2019-05-23 (약 2주, 커밋 189개), 마지막 push 2019-06-21 |
| 저장소 | `git@github.com:ybbarng/mighty.git` (private) |
| 브랜치 | `master` + 미완성 `feature/card-dealing-animation`, `feature/card-dealing-animation-test` (wip 커밋 4~5개) |
| 스택 | create-react-app 3.0 (`react-scripts` 3.0.0), React 16.8, boardgame.io 0.31.5, JavaScript (타입 없음), yarn |
| 코드 규모 | 게임 로직 약 880줄(`src/core`), UI 약 1,500줄(`src/components`) + CSS 약 1,100줄 |
| 테스트 | `validateFriend` 2개, App 렌더링 1개 |
| 실행 방식 | 한 브라우저 탭 안에 클라이언트 5개를 띄우고 "다음/이전" 버튼으로 시점을 바꾸는 **로컬 핫시트** (서버 없음, AI 없음) |
| 빌드 | Node 24에서 `yarn install` 성공(선택 의존성 `fsevents` 네이티브 빌드 실패는 무시됨), `yarn build`는 webpack 4의 `ERR_OSSL_EVP_UNSUPPORTED`로 **실패**. `NODE_OPTIONS=--openssl-legacy-provider`를 주면 빌드 성공. `yarn test` 3개 통과 |

## 구현된 것

게임 한 판의 흐름(`src/core/Game.js`의 phase)은 끝까지 이어진다.

```
init → shuffle → deal → bidding → exchangingCard → callingPartner → play → scoring → init …
```

- **덱**: 53장(4무늬 × 13 + 조커). 랭크는 `1 = 2`, …, `9 = 10`, `10 = J`, `11 = Q`, `12 = K`, `13 = A` (`src/core/Card.js`)
- **딜**: 10장씩 5명, 남은 3장은 주공이 가져간다(`drawCard`)
- **공약(출마)**: 무늬 + 점수, 노기루다는 1점 낮게 낼 수 있음, 최대 20, 포기
- **주공 카드 교환**: 3장 버리기, 이때 공약 변경 가능
- **프렌드 지정**: 마이티 / 조커 / 기루다 A / 기루다 K / 초구 / 노프렌드 / 플레이어 지정 / 카드 지정
- **트릭 진행**: 리드 무늬 따라내기, 마이티·조커·조커콜, 주공 첫 트릭 기루다 금지, 첫·마지막 트릭 조커 효력 없음
- **점수**: 10·J·Q·K·A가 점수 카드, 여당 점수 카드 수로 승패, 위험 보상(2.0) 방식 계산, 퍼센트 점수판
- **다음 판 딜러**: 프렌드(없으면 주공)
- **UI**: 반응형 테이블 배치(작은 폰 대응), 셔플 애니메이션(deck-of-cards 참고), 원작 Mighty Network(mighty40)의 효과음 18개, 카드 SVG 이미지
- **비밀 정보 숨기기**: `playerView`로 다른 사람 손패를 뒷면으로 바꾼다(`src/core/Secret.js`)

## 구현되지 않은 것

- 서버/온라인 멀티플레이 (현재는 `multiplayer: { local: true }`)
- 컴퓨터 플레이어(AI)
- 규칙 옵션 — 모든 규칙이 코드에 값으로 박혀 있다
- 딜미스: `dealmiss` move는 있지만 어느 phase의 `allowedMoves`에도 없고 UI도 없다
- 은퇴(`retire`): `console.log`만 한다
- 5인 외 인원수: `initTrick(5)`, `getTrickOrder`의 `% 5`, `getHandPositions(5)` 등 5명이 그대로 적혀 있다
- 로비·닉네임·방 만들기, 재접속, 게임 기록
- 카드 딜 애니메이션 (feature 브랜치에서 작업하다 멈춤)

## 코드를 읽다가 찾은 버그

실행해서 재현한 것이 아니라 코드를 읽고 찾은 것이다. 새로 만들든 옮기든 규칙 테스트로 확인해야 할 목록으로 쓴다.

| # | 위치 | 문제 | 영향 |
| --- | --- | --- | --- |
| 1 | `src/core/Game.js` `playCard` | `isJokerHunter(card)`를 인자 하나로 부른다 (정의는 `isJokerHunter(trump, card)`) | 조커콜 카드가 서버 쪽에서 조커콜로 인식되지 않는다. `G.callJoker`가 켜지지 않아 **조커콜이 동작하지 않는다** |
| 2 | `src/core/Game.js` `playCard` | `SpecialCard.Joker` 오타 (`JOKER`여야 함) | 조커를 리드할 때 고른 무늬가 저장되지 않는다. 조커 리드 트릭에서 **따라낼 무늬가 없어진다** |
| 3 | `src/core/Utils.js` `getIndex` | `for (var i = 0; cards.length; i++)` — 조건이 `i < cards.length`가 아니다 | 손에 없는 카드를 내면 `undefined.id`로 예외가 난다 |
| 4 | `src/core/Utils.js` `isFriendByCard` | 기루다 A 프렌드가 `rank === 1`, 기루다 K가 `rank === 13` | 랭크 체계를 바꾼 커밋(`1cab1e4`) 때 같이 안 고쳐졌다. **기루다 A 프렌드는 실제로 기루다 2, 기루다 K 프렌드는 기루다 A**를 찾는다 |
| 5 | `src/components/FriendSelector/FriendSelector.js` | 플레이어 지정 버튼이 `"1"`~`"5"`를 만든다 (플레이어 id는 `"0"`~`"4"`) | 0번 플레이어를 지정할 수 없고, `"5"`를 고르면 없는 플레이어를 가리킨다. 서버 쪽 `validateFriend`도 `ctx.numPlayers`를 그대로 돌려줘 항상 통과한다 |
| 6 | `src/core/Utils.js` `getRecomendedForTrump` | `suitIndex > 0` (다이아몬드 index가 0) | 기루다 추천에서 다이아몬드가 빠진다 |
| 7 | 공약 최소값 | `init`에서 `point: 11`로 시작해 최소 공약이 12(노기루다 11)인데, 점수 계산의 기준은 `minPoint = 13` | 12점 공약으로 이기면 기본 점수가 음수가 될 수 있다 |
| 8 | 공약 변경 규칙 | 주공의 공약 변경 최소값을 UI(`BidVote`, 무늬 바꾸면 +2)와 게임 로직(`bid` move, +1)이 따로 계산한다 | 두 곳이 어긋난다. 규칙이 UI에 새어 나와 있다 |
| 9 | `src/components/Scoreboard/Scoreboard.js` | 기본 점수 식을 `(공약 - 득점)×2 + …`로 표시 (실제 계산은 `(공약 - 13)×2 + …`), 부호를 "내가 이겼는지"로 표시 | 점수판 설명이 실제 계산과 다르다 |
| 10 | `src/components/App/App.js` | `render()` 안에서 `Client({...})`를 매번 새로 만든다 | 다른 플레이어 화면으로 넘길 때마다 클라이언트 컴포넌트가 새로 만들어진다 |

## 구조상 문제 (다시 손대기 어려웠던 이유)

1. **게임 진행을 UI가 몰고 간다.** 셔플·딜·바닥 카드 가져오기를 `Board`의 `componentDidUpdate` → `autoMoves()` → `setTimeout`이 호출한다. 화면이 마운트되어 있지 않으면 게임이 멈추고, 여러 클라이언트가 동시에 같은 move를 부르려 한다. `Board.js`의 "1.3초 뒤 `endPhase`" 같은 타이밍 코드가 애니메이션과 게임 상태 전환을 묶어 버렸다.
2. **한 동작이 move 여러 개로 쪼개져 있다.** 공약은 `bid` → `endTurn`, 교환 확정은 `bid` → `discardCards` → `endPhase`처럼 클라이언트가 여러 번 보낸다. 중간에 하나만 실패하면 상태가 어긋난다. 커밋 로그의 `ERROR: invalid stateID`, `Workaround of the bug of TurnOrder.ANY_ONCE`, `Fix infinity loop`가 모두 이 문제다.
3. **boardgame.io 0.31 시절 API에 묶여 있다.** `Game()` 래퍼, `flow.phases`, `TurnOrder.CUSTOM_FROM`, `allowedMoves`, `endPhaseIf`, `(G, ctx)` move 시그니처는 이후 버전에서 모두 바뀌었다. 라이브러리만 올려서는 돌아가지 않고 사실상 게임 정의를 다시 써야 한다.
4. **애니메이션 상태를 게임 상태(`G.prevMove`)로 전달한다.** 효과음·애니메이션을 위해 "직전 move"를 게임 상태에 넣었다. 이 방식으로 딜 애니메이션을 만들다가 막힌 흔적이 feature 브랜치에 남아 있다.
5. **규칙이 코드 곳곳에 값으로 흩어져 있다.** 5명, 10장, 최소 13, 마이티/조커콜 카드, 첫·마지막 트릭 조커 효력 등이 여러 파일에 그대로 적혀 있어 옵션화하려면 전부 찾아 바꿔야 한다.
6. **타입이 없다.** 카드의 `rank` 의미를 바꾸자 4번 버그가 생긴 것처럼, 데이터 모양이 바뀌면 깨지는 곳을 찾을 방법이 없다.

## 그대로 살릴 수 있는 자산

- 규칙 지식: `Utils.js`의 판정 함수들(`getPower`, `isPlayableCardInternal`, `findWinnerInternal`, `getBasePoint`)은 위 버그만 고치면 로직 자체는 쓸 만하다. 새 코드의 규칙 테스트 기댓값을 만들 때 참고한다.
- 한국어 문구(`src/core/Strings.js`): 원작 용어(출마, 기루다, 노기루다, 프랜드, 주공, 조커콜, 초구)가 정리되어 있다.
- 효과음 18개(`src/components/Sound/resources/`): mighty40에서 가져온 것 — 라이선스는 [02-research.md](./02-research.md) 참고.
- 카드 이미지(`src/components/Card/faces/*.svg`, `back.png`)와 카드 CSS: deck-of-cards 기반.
- UI 흐름: 공약 다이얼로그(`BidVote`), 프렌드 선택(`FriendSelector`), 점수판(`Scoreboard`)의 구성과 작은 화면 대응 경험.
