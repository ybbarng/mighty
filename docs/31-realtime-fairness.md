# 실시간 경쟁 게임의 "누가 먼저인가" 판정 방법 조사 (2026-10-29)

대상: 원카드("원카드!" 외치기), 나이롱뽕("뽕"), 할리갈리류(종 치기), SET류(먼저 찾기).
docs/18의 부류 C(실시간 경쟁, 공유 판)를 어떻게 공정하게 판정할지 고르기 위한 조사다. 코드는 바꾸지 않았다.

---

## 0. 한 줄 결론

**"언제 눌렀나(절대 시각)"를 다투지 말고 "자극을 본 뒤 얼마 만에 눌렀나(반응 시간)"를 각 기기에서 재서 비교한다.**
반응 시간은 자기 기기의 단조 시계(`performance.now`, 입력 이벤트의 `event.timeStamp`)로 잰 길이라 기기 사이 시계 맞추기가 필요 없고, 망 지연이 판정에서 빠진다(게임 쪽의 "쏜 사람 기준 판정"과 같은 생각).
보고한 반응 시간이 거짓인지는 **왕복 시간(RTT)으로 만든 경계**와 **사람이 낼 수 없는 반응 시간(약 100ms 미만)** 으로 거른다.
반응 시간 차이가 측정 오차 안(창 X 안)이면 동시로 보고 **함께 정한 난수**로 가른다.
청구 메시지는 방장만이 아니라 **모든 기기에 직접** 보내고, 모든 기기가 같은 규칙으로 승자를 계산해 방장의 발표와 맞춰 본다(지금도 참가자끼리 직접 이어져 있다).
게임 설계로 속도 의존을 줄일 수 있는 곳(나이롱뽕의 뽕, 원카드의 자기 외침)은 "외칠 수 있는 시간 창"으로 바꾼다.

---

## 1. 지금 저장소 구조에서 알아 둘 것

| 사실 | 위치 | 판정에 주는 뜻 |
|---|---|---|
| 방장 기기가 엔진을 돌리고, 참가자는 방장 연결만 방장으로 믿는다 | `apps/web/src/net/guest-room.ts`(`hostId` 확인), `host-room.ts` | 지금 그대로면 순서 판정도 방장 손에 있다(C1) |
| **참가자끼리도 WebRTC로 직접 이어져 있다**(trystero는 모두가 모두와 잇는 그물 구조). 멘탈 포커 카드 열쇠는 이미 "받는 기기에게만 직접" 보낸다 | `guest-room.ts` 531행 근처, `p2p-transport.ts`(`send(message, to)`) | 청구를 모두에게 직접 뿌리면 방장이 청구를 숨기거나 순서를 바꿔도 다른 기기가 안다 |
| 데이터 채널은 trystero 기본값 `createDataChannel("data")`, 즉 **순서 보장·재전송 있음** | `node_modules/@trystero-p2p/core/dist/peer.mjs` | 패킷 하나가 사라지면 뒤 메시지가 같이 늦는다(앞 막힘). 도착 시각 기반 판정은 흔들리기 쉽다. 반응 시간 기반 판정은 영향이 작다 |
| 연결이 이어지면 선택된 경로(직접/바깥 주소/중계)와 **그 순간 RTT 한 번**(`currentRoundTripTime`)을 진단으로 보낸다 | `apps/web/src/net/rtc-diag.ts` `summarize` | 지연 측정의 시작점은 있다. 하지만 연결 때 한 번뿐이고, 게임 메시지 왕복(브라우저 큐·JS 처리 포함)은 재지 않는다 |
| 진단 기록은 `/diag`로 모아 보낸다. 방 코드는 해시만, 시각은 `performance.now` 기준 | `apps/web/src/net/diag.ts` | 측정 계획(9절)의 수집 통로로 그대로 쓸 수 있다 |
| 제한 시간은 `Clock`(`now`, `after`)으로 재고 시험은 `ManualClock`을 넣는다. `realClock.now`는 `Date.now()` | `packages/fair-play/src/clock.ts` | 반응 시간 재기에는 `Date.now`가 아니라 단조 시계가 필요하다(2절). 시험은 같은 방식으로 시계를 주입하면 된다 |
| 시험용 `MemoryNetwork`는 지연 없이 `queueMicrotask`로 전달한다 | `apps/web/src/net/transport.ts` | 지연·흔들림을 넣는 시험용 망을 하나 더 만들어야 한다(10절) |
| 신호 서버는 우리 서버(SSE 구독 + POST)다 | `apps/web/src/net/signal.ts` | 중립 순서 서버(C3)를 붙일 자리가 이미 있다 |
| docs/24 "개인 시간"은 이미 "참가자 화면 시계는 지연만큼 늦게 보일 수 있다, 판정은 방장 시계 하나"로 정했다 | `docs/24-time-control.md` 4절 | 차례 게임은 이 정도로 충분하다. 실시간 경쟁은 그렇지 않다 |

---

## 2. 문제 정의와 위협 모델

### 2-1. 정직한 사람끼리도 생기는 불공정

1. **자극이 늦게 보인다.** 판(카드가 뒤집힘, 손패가 1장이 됨)은 방장 엔진이 바꾸고, 참가자 화면에는 편도 지연(대략 RTT/2, 20~150ms, 중계면 더)만큼 늦게 뜬다. 방장은 0ms다.
2. **청구가 늦게 닿는다.** 참가자의 "종!"은 다시 편도 지연만큼 늦게 방장에게 닿는다. 도착 순서로 가르면 참가자는 **왕복 한 번(RTT)** 만큼 손해다. 사람 반응 시간(200~300ms)의 차이가 수십 ms라서, RTT 100ms면 승부가 거의 망으로 정해진다.
3. **흔들림(jitter).** 같은 사람도 메시지마다 지연이 다르다. 순서 보장 채널이라 패킷 하나 잃으면 수백 ms 밀릴 수 있다.
4. **편도 지연은 나눠 잴 수 없다.** 왕복만 잴 수 있고, 가는 길과 오는 길이 다르면(비대칭) 그 차이의 절반만큼 시계 맞추기가 틀린다. 시계가 맞지 않으면 편도 지연과 시계 차이를 구별할 수 없다는 것은 잘 알려진 한계다([UMass 1998](https://web.cs.umass.edu/publication/docs/1998/UM-CS-1998-043.pdf), [carnet.hr 슬라이드](https://cuc.carnet.hr/2003/program/slides/s8b4.pdf)).
5. **기기마다 화면·터치 지연이 다르다.** 2013년 측정에서 터치가 화면 반응까지 iPhone 5는 55ms, 당시 안드로이드 최고가 114ms였다([iMore](https://www.imore.com/iphone-5-touchscreen-latency-measured-found-be-25-times-faster-closest-android-device), [New Atlas](https://newatlas.com/smartphone-screen-latency/29144/)). 휴대폰 26대를 로봇으로 잰 연구도 기기마다 차이가 크다고 했다([Nicosia 외 2023, PubMed](https://pubmed.ncbi.nlm.nih.gov/35953659/), [PMC 본문](https://pmc.ncbi.nlm.nih.gov/articles/PMC9918597)). 요즘 기기 수치는 확인하지 못했다. **이 차이는 망과 상관없어서 어떤 판정 방식으로도 지울 수 없다.** 같은 방에서 폰을 나란히 놓고 해도 남는다.
6. **화면 갱신 단위.** 60Hz면 16.7ms마다 그린다. "자극을 보였다"는 순간을 화면이 실제로 그린 프레임으로 잡아야 오차가 한 프레임 안이다.
7. **타이머 정밀도.** Firefox는 `performance.now`/`Date.now`를 기본 1ms로 거칠게 만든다([MDN Performance.now](https://developer.mozilla.org/fr/docs/Web/API/Performance.now()), [Mozilla 버그 1313420](https://bugzilla.mozilla.org/show_bug.cgi?id=1313420)). Safari 값은 이번에 확인하지 못했다(측정 계획에 넣음). 1ms 단위면 판정에는 충분하다. `performance.now`는 줄어들지 않고 시스템 시계 조정에 영향받지 않는다. `Date.now`는 사용자가 시계를 바꾸거나 NTP가 고치면 튄다.

### 2-2. 누가 무엇을 속일 수 있나

| 누가 | 할 수 있는 속임 | 지금 구조(C1)에서 | 아래 추천안에서 |
|---|---|---|---|
| 방장 | 자기 청구를 먼저 처리, 남의 청구를 늦게/빼고 처리 | 아무도 모른다 | 청구가 모두에게 직접 가고 모두가 다시 계산하므로 **바로 드러난다** |
| 방장 | 자극을 자기 화면에 먼저 띄우고 미리 준비(0ms 지연) | 그대로 유리 | 반응 시간을 각자 자기 화면 기준으로 재므로 **사라진다**. 단, 방장이 자극 내용을 공개 전에 아는 경우(아래)는 남는다 |
| 방장 | 엔진이라서 다음에 뒤집힐 카드를 미리 안다 | 할리갈리·SET에서 결정적 | 멘탈 포커/약속 뒤 공개로 뒤집기 전에는 방장도 모르게 해야 한다(이미 있는 도구). 이건 시간 문제가 아니라 정보 문제다 |
| 누구나 | 반응 시간을 짧게 거짓 보고 | 해당 없음(C1은 도착 순서) | RTT 경계 확인으로 **흔들림만큼까지만** 속일 수 있다(수십 ms). 100ms 미만은 거절 |
| 누구나 | 자기 시계를 일부러 틀리게(C2 방식일 때) | — | 반응 시간 방식은 시계 맞추기에 기대지 않는다 |
| 누구나 | 망을 일부러 느리게 해서 남의 자극/청구를 본 뒤 행동 | — | 반응 시간 방식에서는 이득이 없다(느리게 보면 반응도 늦게 시작). "늦게 보낸 청구"는 경계 확인으로 잡는다 |
| 누구나 | 자동 누르기 프로그램(화면을 읽고 0.15초에 누름) | 못 막음 | **못 막는다.** docs/18 "어디서든 못 막는 것"과 같다. 통계로 의심만 할 수 있다(8절) |
| 신호/순서 서버 운영자 | 순서 서버를 쓰면 순서를 바꿀 수 있다 | — | 서버를 믿어야 한다(7절) |

공정성 목표는 docs/18과 같게 둔다: **"규칙과 운, 그리고 순서를 남이 바꾸지 못한다"** 까지. "사람 손이 아닌 프로그램"과 "기기 자체가 느린 것"은 범위 밖으로 둔다.

---

## 3. 방법별 정리

각 방법을 원리 / 이 저장소에 넣는 방법 / 기대 정확도와 한계 / 속임 / 비용 / 난이도 순으로 적는다.

### 방법 1. 방장 도착 순서 그대로 (C1, 기준선)

- **원리**: 방장 엔진이 메시지를 받은 순서대로 처리한다. 방장 자신의 입력은 0ms.
- **넣는 방법**: `GameKit`이 "아무 때나 누구든 낼 수 있는 결정"을 받게만 하면 된다(docs/18 부류 C).
- **정확도**: 참가자는 RTT만큼 손해. 방장과 같은 와이파이면 RTT 수 ms라 거의 공정, 다른 망이면 50~300ms 손해.
- **속임**: 방장이 무엇이든 할 수 있고 아무도 모른다.
- **비용·난이도**: 없음 / 쉬움.
- **쓸 곳**: 같은 방에서 모여 하는 경우의 첫 시제품. 결과를 "방장 판정"이라고 화면에 밝힌다.

### 방법 2. 시계 맞추기 + 누른 시각 보고 (C2)

- **원리**: 참가자가 방장에게 핑을 여러 번 보낸다. 보낸 시각 t0, 방장 시각 T, 받은 시각 t1이면 RTT = t1 − t0, 시계 차이 ≈ T − (t0 + t1)/2(Cristian 방식). 여러 번 재서 **RTT가 가장 짧은 표본**을 쓰면 줄 서 기다린 시간이 가장 적어 오차 경계가 좁아진다([위키백과 Cristian's algorithm](https://en.wikipedia.org/wiki/Cristian%27s_algorithm), [Buffalo 강의 자료](https://cse.buffalo.edu/~stevko/courses/cse486/spring16/lectures/08-time.pdf)). 오차 경계는 대략 (RTT − 2·최소 편도)/2이고, 여기에 경로 비대칭의 절반이 더해진다(경계 밖이라 잴 수 없다). 그 뒤 각자 "방장 시계로 환산한 누른 시각"을 보내고, 방장은 그 시각으로 순서를 정한다. Overwatch도 클라이언트 시계를 서버보다 "RTT/2 + 명령 한 칸" 앞서게 맞춘다고 알려져 있다([GDC Vault 발표 소개](https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and), [gamedev.net 논의](https://gamedev.net/forums/topic/696756-command-frames-and-tick-synchronization)).
- **넣는 방법**: `net/`에 `clock-sync.ts`(핑 주고받기, 최소 RTT 표본 고르기, 시계 차이 추정)를 두고 `HostRoom`·`GuestRoom`이 대기실과 판 중간에 몇 초마다 돌린다. 시각 기준은 `performance.timeOrigin + performance.now()`(두 기기의 `timeOrigin`은 서로 다르므로 시계 차이로 맞춘다).
- **정확도**: 브라우저에서 NTP 비슷하게 맞춘 예로 ±10ms 안팎을 보고한 데모가 있지만 비공식이다([synchronized-sax-gandalf](https://github.com/Dassderdie/synchronized-sax-gandalf)). 같은 와이파이면 수 ms, 이동통신·중계면 비대칭 때문에 10~30ms 이상 틀릴 수 있다고 보는 게 안전하다(추정, 측정 필요). 표준 도구는 없다. W3C도 "웹소켓·WebRTC 위에 직접 쌓으라"고 닫았다([W3C 버그 27915](https://www.w3.org/Bugs/Public/show_bug.cgi?id=27915)). 휴대폰 시계는 분당 수 ms씩 흐를 수 있어(추정) 판 중간에도 다시 맞춰야 한다. 백그라운드 탭에서는 타이머가 느려져 측정을 멈춰야 한다([clocksy](https://github.com/guigrpa/clocksy)).
- **속임**: **크다.** 누른 시각을 그냥 앞당겨 보내면 된다. 막으려면 방법 4의 경계 확인이 꼭 필요하다. 그리고 이 방식은 여전히 "자극을 늦게 본 사람"의 손해(편도 지연)를 남긴다. 절대 시각을 비교하기 때문이다.
- **비용·난이도**: 서버 없음 / 중간.
- **판단**: 단독으로는 추천하지 않는다. 방법 3이 시계 맞추기 없이 더 나은 결과를 낸다. 시계 맞추기는 방법 4의 경계 확인을 조이는 보조로만 쓴다.

### 방법 3. 반응 시간 재기 (자극 기준 상대 시간) — 핵심 추천

- **원리**: "쏜 사람 기준으로 판정하기"(서버가 쏜 사람의 지연만큼 세계를 되감아 그 사람이 본 화면으로 맞았는지 따짐, [Valve Lag Compensation](https://developer.valvesoftware.com/wiki/Lag_Compensation), [Valve NPC Lag Compensation](https://developer.valvesoftware.com/wiki/NPC_Lag_Compensation))를 우리 게임에 옮긴 것이다. 실시간 경쟁 카드 게임은 **"이 자극이 보인 뒤 얼마 만에"** 만 의미가 있으므로, 되감을 세계도 없이 더 단순하다.
  1. 판이 바뀌는 사건마다 번호(`stimulusId`)를 붙인다(예: 3번째로 뒤집은 카드).
  2. 각 기기는 그 사건을 **실제로 그린 프레임 시각** `shownAt`을 적는다(`requestAnimationFrame` 콜백 시각. 그린 뒤 다음 프레임에서 잡으면 한 프레임 안 오차).
  3. 누르면 입력 이벤트의 `event.timeStamp`(이벤트가 만들어진 순간, `performance.now`와 같은 기준)로 `pressedAt`을 잡는다. JS가 늦게 돌아도 이 값은 덜 밀린다.
  4. 청구 = `{stimulusId, rt: pressedAt − shownAt, 내용}`. 모두에게 보낸다(방법 6).
  5. 승자 = 가장 작은 `rt`. 차이가 창 X 안이면 동시(방법 5).
- **넣는 방법**:
  - 엔진: 청구를 받는 결정 종류(예: `Claim { stimulusId, rtMs, ... }`)를 두고, "창이 닫히면 모인 청구로 승자 계산"을 **순수 함수**(`resolveClaims(claims, rule, tieSeed)`)로 둔다. 기록과 `replay`가 그대로 통한다(판 끝 검증에 반응 시간도 남는다).
  - 화면: 사건을 그린 프레임을 알려 주는 작은 훅(`useStimulusShown(id)`)과, 청구 버튼에서 `event.timeStamp`를 꺼내는 처리.
  - 방: `HostRoom`은 청구 창(예: 첫 청구 도착 뒤 `X + 최대 허용 지연`)을 `Clock.after`로 닫는다. 기다리는 동안 늦게 오는 청구도 받는다.
  - 공통 시각 원천: 지금 `Clock.now`는 `Date.now`라 반응 시간용으로 `MonotonicClock`(`performance.now`)을 따로 두거나 `Clock`에 단조 시각을 더한다. 시험은 둘 다 주입한다.
- **정확도**: 망 지연과 흔들림이 판정에서 빠진다(늦게 본 사람은 늦게 시작하니 공평). 남는 오차는 프레임 단위(±16.7ms, 120Hz면 ±8ms), 타이머 1ms, **기기 터치·화면 지연 차이(수십 ms, 줄일 수 없음)**. 정직한 사람끼리의 실제 공정성 한계는 망이 아니라 기기 차이가 된다.
- **한계**:
  - 자극이 없는 "자유 경쟁"(예: SET에서 판이 그대로인데 누가 먼저 찾나)도 "마지막으로 판이 바뀐 사건"을 자극으로 쓰면 된다. 다만 판이 오래 그대로면 rt가 수십 초가 되고, 그 사이 백그라운드 전환 같은 일이 끼면 값이 이상해진다. 화면이 숨겨졌던 기간이 있으면 그 청구는 rt 대신 도착 순서로 처리하는 식의 기본값이 필요하다.
  - 사건 A를 보기 전에 사건 B가 덮어쓰는 빠른 게임(할리갈리에서 카드가 연달아 뒤집힘)에서는 "어느 자극에 대한 청구인가"가 중요하다. `stimulusId`를 꼭 넣고, 이미 지난 자극에 대한 청구는 그 자극 기준으로 판정할지(되감기) 규칙을 정해야 한다. 할리갈리는 "종을 친 순간 판 상태가 맞았나"가 규칙이라, 청구가 가리킨 `stimulusId`의 판으로 판정하는 것이 "쏜 사람 기준"이다.
- **속임**: `rt`를 작게 거짓 보고할 수 있다. 방법 4로 경계를 건다.
- **비용·난이도**: 서버 없음 / 중간(화면 프레임 시각 잡기와 시험 장치가 일).

### 방법 4. 거짓 반응 시간 거르기: RTT 경계 + 사람 한계

- **원리**: 청구가 늦게 도착했는데 반응 시간은 짧다고 우기면 앞뒤가 안 맞는다.
  - 방장 H가 자극을 보낸 시각 s(H의 시계), 참가자 G의 청구가 H에 도착한 시각 a. 정직하면 a − s ≈ (편도 H→G) + 그리기 지연 + rt + (편도 G→H) ≥ rt + RTT_min − ε.
  - 그러므로 **rt 허용 상한 = (a − s) − RTT_min + 여유**. 보고한 rt가 이보다 작으면 문제없다(정직하게 느린 것). 반대로 이 확인은 "rt를 줄여 보고"하는 것을 **RTT_min과 실제 RTT의 차이(=흔들림)만큼까지만** 허락한다. 즉 거짓 이득의 상한이 흔들림이다.
  - 틀린 방향 확인도 가능하다: 같은 자극에 대해 rt가 사람 한계보다 작으면(100ms 미만) 거절한다. 육상은 총성 뒤 0.100초 안 출발을 부정 출발로 본다([AP 해설, CBS](https://www.cbsnews.com/amp/philadelphia/news/explainer-eagles-devon-allen-disqualified-hurles-world-championships)). 다만 100ms 아래도 드물게 생리적으로 가능하다는 반론이 있다([Fiore 외 2025, arXiv](https://arxiv.org/html/2506.11460v1)). 시각 자극 단순 반응은 대개 200~250ms이고([PMC6916673](https://pmc.ncbi.nlm.nih.gov/articles/PMC6916673), [Duckware 브라우저 측정](https://duckware.com/tech/measure-human-visual-response-times.html)), 터치 화면은 기기 지연이 더해져 더 길다. **판정 규칙에는 "120ms 미만은 너무 빠름(예측)으로 무효" 정도를 두고, 정확한 값은 9절 측정으로 정한다.** 할리갈리처럼 판을 보고 판단해야 하는 게임은 단순 반응보다 훨씬 길어 기준을 더 높여도 된다.
  - 방장도 같은 방식으로 확인받는다: 참가자 G는 자극을 받은 시각 r_G와 방장 청구가 도착한 시각 a_G를 안다. 방장이 정직하면 a_G − r_G ≈ rt_H + (그리기) − (RTT 비대칭 영향)이라, **rt_H ≥ (a_G − r_G) − 여유** 여야 한다. 방장이 rt를 줄여 보고하면 참가자 쪽에서 드러난다. 모든 쌍이 서로를 확인할 수 있다(그물 연결이 있어서).
- **넣는 방법**: 방법 2의 핑 측정에서 쌍마다 `RTT_min`과 최근 흔들림(예: 최근 20개의 p90 − min)을 계속 갖고 있는다(`net/latency.ts`). 확인 함수는 순수 함수(`checkClaimBound(claim, arrival, stimulusSentAt, linkStats)`)로 두고 방장과 참가자 모두 쓴다. 어긋나면 그 청구를 무효로 하거나 "의심" 기록을 남긴다.
- **정확도**: 여유를 흔들림 p95 정도로 두면 정직한 사람이 억울하게 걸리는 일은 5% 안팎, 거짓 이득은 그 여유만큼. 순서 보장 채널에서 패킷 손실이 생기면 정직한 청구도 크게 늦게 와서 "rt 상한이 넉넉해질 뿐"이라 억울하게 걸리지는 않는다(늦게 온 쪽은 상한이 커질 뿐 작아지지 않는다). 억울한 경우는 **핑 표본이 우연히 실제보다 짧았을 때**뿐이다.
- **속임**: 흔들림만큼 rt를 깎는 것은 남는다(수십 ms). 일부러 핑 응답을 늦춰 RTT_min을 크게 보이게 하면? 그러면 상한 = (a − s) − RTT_min이 작아져 **자기에게 불리**하다. RTT를 작게 보이게 하는 것은 물리적으로 못 한다(미리 답할 수 없는 난수를 핑에 넣는다). 그래서 이 경계는 속이기 어렵다.
- **비용·난이도**: 서버 없음 / 중간.

### 방법 5. 공정 창 + 함께 정한 난수로 동점 가르기

- **원리**: 측정 오차보다 작은 차이로 순위를 매기는 것은 사실상 무작위다. 그렇다면 그 범위를 "동시"로 선언하고 **누구도 미리 고를 수 없는 난수**로 가르는 편이 정직하다. 합의 연구에서도 "받은 순서 공정성"을 완전히 지키는 것은 불가능하다는 결과가 있고, 동시로 묶어 한 블록에 넣는 완화를 쓴다([Kelkar 외, Order-Fairness for Byzantine Consensus, CRYPTO 2020](https://eprint.iacr.org/2020/269), [Themis](https://eprint.iacr.org/2021/1465)). 우리 문제도 같은 생각이다.
- **창 X 정하기**:
  - 방법 3(반응 시간)을 쓰면 X는 **측정 오차**만 덮으면 된다: 프레임 양자화(두 사람 합쳐 최대 약 33ms) + 기기 터치 지연 차이(모름) → 처음엔 **X = 40~50ms**로 시작하고 9절 측정(고속 촬영)으로 조정.
  - 방법 1(도착 순서)을 쓰면 X는 **흔들림 p95**를 덮어야 해 50~150ms 이상이 된다. 너무 크면 "실력 차이"도 무작위가 된다.
  - 창을 넓히면 운, 좁히면 기기·망 운이 커진다. 게임별로 다르게 둘 수 있게 엔진 규칙 값으로 둔다.
- **난수**: docs/18이 계획한 "함께 정하는 난수"(약속 뒤 공개)를 쓴다. 판 시작 때 각자 r_i를 약속(해시)하고, 동점이 나오면 `H(r_0‖…‖r_n‖stimulusId)`로 가른다.
  - 단순한 대안: 판 시작 때 공개한 r_i로 미리 정하면 "동점이면 누가 이길지"를 미리 알게 된다. 이걸 알아도 더 빨리 누를 수는 없지만, 내가 동점에서 질 걸 알면 덜 서두르는 등 아주 작은 이득이 있다. **동점이 날 때 그때그때 공개**하는 쪽이 깔끔하다. 공개를 거부하는 사람은 그 동점에서 진 것으로 처리한다(약속 뒤 공개의 기본 규칙).
  - 더 가벼운 대안: 동점이면 "그 판에서 덜 이긴 사람에게" 같은 결정 규칙. 속일 거리가 없고 게임 재미에도 맞을 수 있다. 게임별로 고른다.
- **넣는 방법**: `packages/fair-play`에 "약속 뒤 공개"와 "함께 정하는 난수"(docs/18 3단계에 이미 계획)를 넣고, `resolveClaims`가 동점 묶음과 난수로 승자를 낸다.
- **속임**: 난수는 아무도 미리 못 고른다. 창 안에 들어가기 위해 rt를 깎는 것은 방법 4가 막는다.
- **비용·난이도**: 서버 없음 / 쉬움~중간(3단계 도구를 먼저 만들면 쉬움).

### 방법 6. 모두가 증인 (청구를 모두에게 직접, 모두가 같은 계산)

- **원리**: 방장이 판정하더라도 **재료(청구)를 방장만 갖지 않게** 한다. 청구는 각 기기가 모든 기기에 직접 보내고(DTLS로 암호화된 직접 연결이라 방장이 위조·변조 못 함), 모든 기기가 같은 순수 함수로 승자를 계산해 방장 발표와 맞춘다. 지금 "판 끝에 모두가 다시 계산"을 **판 도중으로** 당기는 것이다(docs/18 부류 D의 검증 생각과 같다).
- **넣는 방법**: 청구 메시지는 `transport.send(message)`(대상 없이 모두에게)로 보낸다. 방장은 창을 닫을 때 "이번에 모인 청구 목록 + 승자"를 알리고, 참가자는 자기가 직접 받은 청구가 빠졌거나 승자가 다르면 바로 이의를 낸다(`fair-verify`처럼 화면에 표시, 판 무효 또는 다시 하기). 서명은 이미 연결 단위로 확인되므로(07 보안 "연결 인증서 지문") 따로 필요 없을 수 있다. 다만 "방장이 B에게서 받은 청구를 C에게 그대로 전했다"는 증명이 필요하면 청구에 각자 ECDSA 서명을 붙인다(`identity.ts` 열쇠 재사용).
- **정확도·한계**: 어떤 청구가 일부 기기에만 닿은 경우(연결 하나가 끊김) 기기마다 재료가 달라진다. 그때는 "방장 목록 + 내가 받은 것" 합집합을 기준으로 하고, 방장 목록에 빠진 게 있으면 그것만 이의로 띄우는 기본값이 현실적이다. 참가자 둘 사이 직접 연결이 없을 때(중계 실패)는 방장을 거쳐야 해서 이 보호가 약해진다.
- **속임**: 방장의 "청구 숨기기·순서 바꾸기·승자 바꾸기"가 바로 드러난다. 방장이 남은 것은 "자기 rt 깎기"뿐이고 그건 방법 4가 막는다.
- **비용·난이도**: 서버 없음 / 중간.

### 방법 7. 방장 불리하게 하기(지연 더하기) 또는 방장은 심판만

- **지연 더하기**: 지연이 짧은 사람의 입력에 일부러 지연을 더해 모두 같은 지연을 겪게 하는 "시간 지연" 기법이 연구돼 있다. 항상 더하면 반응이 나빠져서, 높은 지연 상대와 겨룰 때만 더하는 적응형이 체감과 공정을 함께 높였다는 결과가 있다([Tokey·Boudaoud·Spjut·Claypool, FDG 2026](https://research.nvidia.com/publication/2026-08_adaptive-time-delay-improving-player-experience-and-fairness-first-person), [Claypool 지연 보정 분류](https://web.cs.wpi.edu/~claypool/papers/lag-taxonomy/TimeDelay.html)). Tabletop Simulator 사용자도 같은 이유로 핑 정보를 달라고 요청했다([TTS 요청](https://tabletopsimulator.nolt.io/1909)).
  - 우리 구조에 옮기면: 방법 1(도착 순서)을 쓸 때 방장 자신의 청구를 "참가자 RTT 중앙값"만큼 늦춰 처리하고, 방장 화면의 자극도 참가자 편도만큼 늦게 그린다.
  - **한계**: 방장 기기에서 방장이 직접 지연을 거는 것이라 방장이 마음먹으면 끈다. 정직한 방장을 위한 공평 장치일 뿐 속임 방지는 아니다. 참가자끼리도 지연이 서로 다르면 맞출 수 없다. 방법 3을 쓰면 이 장치는 필요 없다(반응 시간에는 이미 지연이 빠져 있다).
- **방장은 심판만**: 방장을 플레이어로 두지 않으면(관전 기기나 TV 화면이 방장) 방장 이득이 사라진다. 모여서 큰 화면 하나에 띄우는 파티 게임(Jackbox 방식: 큰 화면이 진행, 각자 폰이 조종기)에는 자연스럽다. 공개된 Jackbox 판정 방식 자료는 찾지 못했다. 다만 이것도 "심판이 공정하다"는 믿음은 그대로 필요하고, 온라인 원격 플레이에는 맞지 않는다.
- **비용·난이도**: 없음 / 쉬움.

### 방법 8. 중립 순서 서버 (C3)

- **원리**: 게임을 모르는 서버가 방 안 청구에 도착 순서 번호·도착 시각을 붙여 모두에게 돌린다. 모두가 같은 순서를 보므로 방장이 끼어들 틈이 없다.
- **실제 예**: 오픈 소스 SET 게임 setwithfriends는 청구(event)를 Firebase에 쓸 때 보안 규칙으로 `time == now`(서버 시각)를 강제하고([database.rules.json](https://github.com/ekzhang/setwithfriends/blob/main/database.rules.json)), 모든 클라이언트가 이벤트를 서버 시각으로 정렬해 다시 계산하며, 이미 쓰인 카드를 쓰는 늦은 청구는 버린다([src/util.js `computeState`](https://github.com/ekzhang/setwithfriends/blob/main/src/util.js)). 즉 **서버 도착 시각 + 모두가 다시 계산**이다. 망 지연 보정은 없다(서버에 가까운 사람이 유리).
- **넣는 방법(두 갈래)**:
  - 지금 신호 서버(`game.byb.kr/signal`, SSE + POST)에 `/order` 경로를 더한다: 방 주제별로 받은 메시지에 증가 번호와 서버 수신 시각을 붙여 같은 주제 구독자에게 돌린다. 내용은 방 열쇠로 암호화해 서버는 모른다(docs/18 C3 그대로). SSE는 서버→기기, POST는 기기→서버라 POST 왕복(HTTP 연결 재사용 여부에 따라 수십~수백 ms)이 붙는다. 웹소켓이 더 낫다.
  - Cloudflare Durable Object: 객체 하나가 한 번에 한 사건만 처리(단일 스레드)하므로 방 하나 = 객체 하나로 두면 순서 매기기에 맞다([Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects)). 2025년부터 무료 요금제에서도 SQLite 저장 방식으로 쓸 수 있고 하루 10만 요청 한도가 있다([변경 기록](https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/), [요금](https://developers.cloudflare.com/durable-objects/platform/pricing/)). 유료는 100만 요청 포함, 웹소켓 받은 메시지는 20개를 1요청으로 센다. 우리 규모(친구끼리)에는 무료로 충분해 보인다. 다만 새 운영 대상(계정·배포)이 생기고, 객체가 놓이는 지역에 따라 한국 사용자 지연이 달라진다(확인 안 함).
- **정확도**: 서버까지의 지연 차이(사람마다 수 ms~수십 ms, 이동통신은 더)가 그대로 남는다. 방장 이득은 사라지지만 "서버 가까운 사람" 이득이 생긴다. **방법 3(반응 시간)과 합치면** 서버는 "청구가 언제 서버에 닿았나"라는 중립 증거만 주고, 판정은 반응 시간으로 한다. 이때 서버 도착 시각은 방법 4의 경계 확인을 방장 시계 대신 서버 시계로 하게 해 준다(방장 시계를 믿지 않아도 됨).
- **속임**: 서버 운영자(=지금은 사용자 본인)를 믿어야 한다. 친구들이 방장을 못 믿을 상황에서 서버 운영자도 방장과 같은 사람이면 의미가 약하다. 다만 "방장 기기 개발자 도구로 고치기"보다 "서버 코드를 바꾸기"가 훨씬 어렵다는 실익은 있다.
- **비용·난이도**: 서버 운영·메시지 비용 / 중간. 막힌 망에서 WebRTC 대신 쓰는 통로 겸용이 되는 덤이 있다(docs/18).
- **판단**: 방법 3+4+6으로 방장 속임을 거의 막을 수 있어 **처음에는 필요 없다**. 남는 걱정이 "방장이 rt를 흔들림만큼 깎는다"인데, 이건 서버를 붙여도 rt 방식이면 똑같이 남는다. 나중에 막힌 망 대체 통로가 필요해질 때 함께 고려한다.

### 방법 9. 암호 도구: 무엇을 증명할 수 있고 없나

| 도구 | 증명하는 것 | 증명 못 하는 것 | 쓸 곳 |
|---|---|---|---|
| 서명(ECDSA, 이미 있음) | 이 청구를 이 사람이 썼고 바뀌지 않았다 | **언제** 썼는지 | 방법 6에서 방장이 남의 청구를 전달할 때 위조 방지 |
| 약속 뒤 공개(해시) | 공개 전에 값을 정해 두었다(나중에 바꾸지 않았다) | 약속한 시각이 진짜 그 시각인지 | 동점 난수(방법 5). "청구 내용"을 먼저 약속하고 나중에 공개하면 남의 청구를 보고 따라 하기를 막는다(SET에서 남이 찾은 세트를 보고 같은 걸 내기) |
| 반응 시간 약속 뒤 공개 | 남의 rt를 본 뒤 내 rt를 고치지 않았다 | rt 자체가 진짜인지 | 창 닫기 전에 rt가 서로 보이면 늦게 낸 사람이 유리해질 때. 방법 6은 청구가 모두에게 바로 가므로, 창이 닫힌 뒤 오는 청구는 받지 않는 규칙만으로도 충분하다(약속이 없어도 됨) |
| 검증 가능한 지연 함수(VDF) | 최소 몇 단계의 **순차 계산**을 했다 | 언제 시작했는지, 누가 했는지, 실제 경과 시간(빠른 하드웨어면 짧아짐) | 거의 없음. "어떤 값(예: 자극)이 공개된 뒤 최소 T가 지났다"를 증명하는 데 쓸 수 있지만, 우리 문제는 "얼마나 **빨리**"라서 반대 방향이다. 휴대폰과 PC 계산 속도 차이도 크다([Boneh VDF 강연 정리](https://diyhpl.us/wiki/transcripts/verifiable-delay-functions/vdf-day-2019/dan-boneh), [Hoffmann 2025 학위 논문](https://research-explorer.ista.ac.at/record/20920)) |
| 믿을 만한 시각 서버의 서명(타임스탬프) | 그 서버가 그 시각에 이 값을 봤다 | 서버를 믿지 않으면 아무것도 | 방법 8과 같다(서버를 믿는다는 가정) |

**결론: 믿을 시계 없이 "언제 일어났는지"는 암호로 증명할 수 없다.** 할 수 있는 것은 (1) 순서를 바꾸지 못하게 모두가 재료를 갖고 다시 계산하기, (2) 거짓 시각의 범위를 왕복 시간으로 묶기, (3) 범위 안은 무작위로 가르기다. 위 방법 4~6이 정확히 이 셋이다.

### 방법 10. 게임 설계로 속도 의존 줄이기

| 게임 | 속도 경쟁의 실제 모양 | 바꿀 수 있는 설계 | 재미 손실 |
|---|---|---|---|
| 원카드 | 한 장 남은 사람 본인이 먼저 외치면 안전, 남이 먼저 외치면 벌칙(UNO도 같다: 다음 사람이 차례를 시작하기 전에 남이 먼저 외치면 2장 뽑기, [Mattel UNO 설명서](https://service.mattel.com//instruction_sheets/HPW20-Eng.pdf)) | **본인에게 짧은 우선 시간**: 한 장이 된 순간(본인 화면 기준)부터 예: 1.5초 안에 본인이 외치면 무조건 안전. 그 뒤에는 누구든 먼저 외친 사람이 이긴다(방법 3·5로 판정). 동점이면 본인 쪽 손을 들어 준다(의심나면 피고 편) | 작다. 오프라인에서도 본인이 바로 외치면 사실상 안전하다. "남이 잡아내기"의 긴장은 남는다 |
| 나이롱뽕 | 나무위키 설명으로는 뽕이 자기 차례 안의 행동이다([나무위키](https://namu.wiki/w/%EB%82%98%EC%9D%B4%EB%A1%B1%EB%BD%95)). 집마다 남의 차례에 끼어드는 규칙도 있다(확인 못 함). 화투는 같은 월이 4장이라 1장이 버려지면 남은 3장 중 2장을 가진 사람은 **한 명뿐**이다 → **뽕끼리 겹칠 일이 없다** | 버린 직후 **뽕 받는 시간 창**(예: 2초, 모두에게 "뽕/넘김" 버튼). 창 안에 뽕하면 무조건 뽕, 경쟁 상대는 "다음 사람이 그냥 진행하는 것"뿐이다. 온라인 마작이 퐁·론을 속도가 아니라 우선순위(론 > 퐁·깡 > 치)로 가르는 것과 같다([BGA 리치 마작 도움말](https://en.doc.boardgamearena.com/Gamehelpriichimahjong)) | 거의 없음. 실시간 판정이 필요 없어진다(부류 A로 내려온다). 다만 버튼이 뜨는 것 자체가 "누군가 뽕할 수 있다"는 정보를 흘리므로 **모두에게 항상 같은 창을 띄운다** |
| 할리갈리류 | 순수 반응 속도가 핵심. 같은 과일 5개를 보고 가장 먼저 종 | 줄이기 어렵다. 방법 3+4+5 전부 필요. 창 X 안 동점은 무작위 또는 "카드 나누기". 잘못 친 벌칙도 청구가 가리킨 `stimulusId` 판으로 판정 | 설계로 줄이면 게임이 아니다 |
| SET류 | 먼저 찾은 사람이 가져감. 찾는 데 수 초가 걸려 **수십 ms 차이 동점은 드물다** | 겹치지 않는 세트는 **둘 다 인정**(카드가 겹칠 때만 경쟁). 겹치면 방법 3 판정, 창 안이면 무작위. 반응 시간 기준 자극 = 판이 마지막으로 바뀐 사건 | 작다 |

---

## 4. 비교 표

| 방법 | 방장 지연 이득 | 방장 순서 조작 | 거짓 시각 | 정직한 사람끼리 오차 | 서버 | 난이도 |
|---|---|---|---|---|---|---|
| 1. 방장 도착 순서 | 남음(RTT) | 못 막음 | 해당 없음 | 큼(RTT 차이) | 없음 | 쉬움 |
| 2. 시계 맞추기 + 시각 | 편도만큼 남음 | 못 막음 | 못 막음(4 필요) | 비대칭/2 + 흔들림 | 없음 | 중간 |
| 3. 반응 시간 | **없음** | 못 막음(6 필요) | 못 막음(4 필요) | 프레임 + 기기 터치 차이 | 없음 | 중간 |
| 4. RTT 경계 + 사람 한계 | — | — | **흔들림만큼으로 묶음** | 억울한 무효 소수 | 없음 | 중간 |
| 5. 공정 창 + 난수 | — | — | — | 창 안은 공평한 운 | 없음 | 쉬움(난수 도구 뒤) |
| 6. 모두가 증인 | — | **바로 드러남** | — | — | 없음 | 중간 |
| 7. 지연 더하기 / 심판만 | 정직하면 없음 | 못 막음 | — | 참가자끼리 차이 남음 | 없음 | 쉬움 |
| 8. 중립 순서 서버 | 없음(서버 거리 이득으로 바뀜) | 막음(서버 믿음) | 서버 시각이면 막음 | 서버까지 지연 차이 | **필요** | 중간 |
| 9. 암호(VDF 등) | — | 서명·약속은 6·5의 부품 | 시각 증명 불가 | — | 없음 | — |
| 10. 설계 바꾸기 | 게임에 따라 사라짐 | 창 판정은 6으로 | — | — | 없음 | 게임마다 |

---

## 5. 추천안

### 1단계: 먼저 할 것 (서버 없이)

1. **지연 측정 장치**(`net/latency.ts`): 대기실·판 중간에 쌍마다 핑(난수 포함)을 몇 초 간격으로 주고받아 RTT 최근 표본, `RTT_min`, 흔들림(p90 − min)을 유지. `performance.now` 기준. 숨겨진 탭이면 멈춤. 결과를 `diag("rtt", …)`로도 보낸다(9절 측정을 겸함).
2. **반응 시간 청구**(방법 3): 엔진에 `stimulusId`가 붙은 청구 결정 종류, 화면에 "그린 프레임 시각"과 `event.timeStamp` 잡기.
3. **승자 계산 순수 함수**(방법 4·5): `resolveClaims(claims, bounds, rule, tieRandom)` — 경계 밖·사람 한계 밖 청구 무효 → 가장 작은 rt → 창 X 안이면 동점 → 난수. 엔진 기록에 들어가 판 끝 검증이 다시 계산한다.
4. **모두가 증인**(방법 6): 청구는 모두에게 직접. 방장 발표와 자기 계산이 다르면 화면에 표시.
5. **첫 게임은 나이롱뽕 또는 SET**: 나이롱뽕은 "뽕 받는 창"으로 바꾸면 실시간 판정 없이 시작할 수 있고, SET은 동점이 드물어 판정 장치를 부담 없이 검증한다. 할리갈리는 측정 뒤에.

### 2단계: 측정할 것 (9절)

- 실제 폰 조합별 RTT·흔들림, 경로(직접/중계)별 분포 → 경계 여유와 창 X(도착 순서용) 결정.
- 고속 촬영으로 "진짜 누른 순서" vs "판정 순서" 일치율 → 창 X(반응 시간용)와 기기 지연 차이 확인.
- 사람 반응 시간 분포(게임별) → "너무 빠름" 기준.

### 3단계: 나중에 할 것

- 할리갈리류(가장 엄격).
- 일부 쌍의 직접 연결이 없을 때(중계 실패) 처리.
- 필요하면 중립 순서 서버(방법 8) — 막힌 망 대체 통로가 필요해질 때 함께.
- 통계로 자동 누르기 의심 표시: 한 사람의 rt가 계속 매우 짧고 고르게(분산이 사람보다 작게) 나오면 판 끝에 "의심" 표시만. 판정에는 쓰지 않는다(억울한 사람이 생긴다).

### 게임별 적용 요약

| 게임 | 판정 | 창 X(처음 값, 측정으로 조정) | 동점 |
|---|---|---|---|
| 원카드 | 본인 우선 시간(예 1.5초) + 그 뒤 반응 시간 경쟁. 자극 = 한 장이 된 장면 | 50ms | 본인 손을 들어 줌 |
| 나이롱뽕 | 뽕 받는 창(예 2초, 모두에게 같은 버튼). 실시간 판정 불필요 | — | 뽕끼리 겹칠 수 없음 |
| 할리갈리류 | 반응 시간 + 경계 + 사람 한계(판단이 필요해 기준 높게) + 모두가 증인 | 40~50ms | 함께 정한 난수 |
| SET류 | 겹치지 않으면 둘 다 인정. 겹치면 반응 시간(자극 = 판이 마지막으로 바뀐 장면) | 50ms | 함께 정한 난수 |

---

## 6. 시계·시각 원천 정리

| 쓸 것 | 쓰지 말 것 | 이유 |
|---|---|---|
| `performance.now()`(기기 안 길이) | `Date.now()`(길이 재기) | 단조, 시스템 시계 변경 영향 없음 |
| 입력 이벤트 `event.timeStamp` | 처리기 안에서 `performance.now()` | JS가 바쁠 때 밀린 만큼 덜 틀림 |
| `requestAnimationFrame` 콜백 시각(그린 프레임) | 상태를 바꾼 시각 | 사람이 실제로 본 순간에 더 가깝다 |
| 쌍별 `RTT_min`(여러 표본 중 최소) | 한 번 잰 RTT, 평균 | 줄 서 기다린 시간이 가장 적은 표본이 경계에 맞다 |
| `getStats()`의 `currentRoundTripTime`(참고) | 그것만으로 판정 | 망 계층 값이라 브라우저 큐·JS 처리 지연이 빠진다. 게임 메시지 핑과 같이 기록해 차이를 본다 |

---

## 7. 측정 계획 (실제 폰 여러 대)

목표는 세 값: **(a) 경계 여유**(흔들림), **(b) 창 X**(정직한 사람끼리 판정 오차), **(c) "너무 빠름" 기준**.

1. **망 측정(자동, 진단 기록으로)**
   - 방에 들어가 있는 동안 쌍마다 2초 간격 핑 → `diag("rtt", { pair, path, rttMs, … })`. 경로는 `rtc-diag.ts`의 `path`(host/srflx/relay)를 붙인다.
   - 조합: 같은 와이파이 / 와이파이↔LTE·5G / 둘 다 이동통신 / TURN 중계 강제(시험용 설정). 안드로이드·아이폰 섞기.
   - 집계: 쌍별 min, p50, p90, p95, p99, 그리고 "rtt − min" 분포(흔들림). 패킷 손실 시 튀는 값(수백 ms) 빈도.
   - `getStats` RTT와 게임 메시지 RTT 차이(브라우저·JS 처리 몫).
2. **판정 오차 측정(사람이 함께, 고속 촬영)**
   - 폰 2~4대를 나란히 두고 숨겨진 시험 화면(예 `/lab/reaction`)에서 "화면이 바뀌면 누르기"를 50~100번.
   - 다른 폰의 240fps 슬로모션(약 4.2ms 단위)으로 화면들과 손가락을 함께 찍어 **진짜로 화면에 뜬 순간·손가락이 닿은 순간**을 센다.
   - 판정(방법 3)이 낸 rt와 촬영으로 센 rt의 차이 = 기기별 표시+터치 지연. 두 기기 차이의 분포가 곧 창 X의 근거다(예: 차이의 p95).
   - 같은 시험을 방장/참가자 역할을 바꿔 하고, 다른 망에서도 해서 "망과 상관없이 같은 결과"인지 본다.
3. **사람 반응 시간(게임별)**
   - 시험 화면에서 단순 반응(색 바뀜)과 게임 판단(과일 5개 찾기) 두 종류. rt 분포의 아래쪽 1%를 보고 "너무 빠름" 기준을 정한다(처음 값 120ms).
4. **타이머 정밀도 확인**: Safari·Chrome·삼성 인터넷에서 `performance.now()` 연속 값의 최소 간격, `event.timeStamp` 단위를 기록한다(이번에 Safari 값은 확인하지 못했다).

---

## 8. 시험 방법 (flaky 없이)

저장소 규칙(시간은 `Clock`으로, 시험은 `ManualClock`, "n ms 기다리기" 금지)을 그대로 따른다.

1. **지연을 넣는 시험용 망 `DelayedNetwork`**: `MemoryNetwork`와 같은 `Transport`를 주되, 전달을 `queueMicrotask` 대신 `clock.after(delay(from, to, n), …)`로 건다. `delay`는 시험이 정하는 함수(고정값, 비대칭, 특정 n번째 메시지만 300ms 등). 시간은 시험이 `clock.advance`로만 옮긴다 → 기기 속도와 상관없이 같은 결과.
2. **입력·화면 시각 주입**: 화면 대신 시험이 "기기 k가 자극 s를 시각 t에 보였다", "시각 t'에 눌렀다"를 직접 넣는다(`MonotonicClock`도 기기마다 따로, 시작점을 다르게 해서 시계 차이도 흉내).
3. **꼭 넣을 경우**
   - 방장 지연 0, 참가자 RTT 200ms, 참가자 rt가 방장보다 60ms 짧으면 참가자가 이긴다(지금 C1이면 지는 경우).
   - 차이가 창 X 안이면 동점 → 정해진 씨앗에서 정해진 승자(난수 함수도 씨앗 주입).
   - 비대칭 지연(가는 길 20ms, 오는 길 180ms)에서 정직한 청구가 경계에 걸리지 않는다.
   - 참가자가 rt를 (흔들림 + 1ms)만큼 깎아 보내면 경계 확인에 걸린다. 흔들림 안이면 통과(한계를 시험으로 적어 둔다).
   - 방장이 rt를 깎아 보내면 참가자 쪽 확인에 걸린다.
   - 방장이 참가자 청구를 빼고 발표하면 다른 참가자가 바로 이의를 낸다(기존 `fair-room-cheat.test.ts` 방식).
   - rt 90ms 청구는 무효.
   - 창이 닫힌 뒤 도착한 청구는 무시되고, 모든 기기가 같은 결론을 낸다.
   - 숨겨진 탭에서 돌아온 청구 처리(기본값 규칙).
4. **순수 함수 시험**: `resolveClaims`, `checkClaimBound`는 망 없이 표로 시험한다(입력 → 기대 승자). 무작위 속성 시험은 씨앗 고정.
5. **시험 역할 나누기**: 판정 논리는 순수 함수 시험에서, 망·방 흐름은 `DelayedNetwork` 시험 몇 개에서만. 같은 논리를 느린 설정으로 되풀이하지 않는다.

---

## 9. 불확실한 점(솔직히)

- 휴대폰 이동통신에서 RTT 비대칭·흔들림의 실제 크기는 우리 측정 전에는 모른다. 위 수치(20~300ms 등)는 과제에 적힌 범위와 일반 상식이다.
- 요즘 기기의 터치·화면 지연 차이 수치는 찾지 못했다(2013년 자료와 2023년 연구 요약뿐). 창 X는 반드시 촬영 측정으로 정해야 한다.
- Safari의 타이머 정밀도, `event.timeStamp`가 기기마다 얼마나 하드웨어 시각에 가까운지는 확인하지 못했다.
- Kahoot·Jackbox·Board Game Arena 할리갈리가 실제로 어떻게 판정하는지 공개 자료를 찾지 못했다. 공개 코드로 확인한 사례는 setwithfriends(서버 시각 정렬) 하나다. 퀴즈 버저 공정성에 관한 국내 논문(2005)이 있으나 해결책 내용은 확인하지 못했다([koreascience](https://koreascience.or.kr/article/CFKO200533239322803.pdf)).
- 원카드·나이롱뽕은 집마다 규칙이 달라 "끼어들기 외침" 규칙은 사용자가 정해야 한다.

---

## 10. 출처

망·시계
- Cristian's algorithm — https://en.wikipedia.org/wiki/Cristian%27s_algorithm
- Buffalo CSE486 시간 강의 — https://cse.buffalo.edu/~stevko/courses/cse486/spring16/lectures/08-time.pdf
- 편도 지연과 시계 차이를 가를 수 없음 — https://web.cs.umass.edu/publication/docs/1998/UM-CS-1998-043.pdf , https://cuc.carnet.hr/2003/program/slides/s8b4.pdf
- W3C 버그 27915(브라우저 NTP 비슷한 표준 없음) — https://www.w3.org/Bugs/Public/show_bug.cgi?id=27915
- clocksy(전송 무관 시계 맞추기, 숨긴 탭 멈춤) — https://github.com/guigrpa/clocksy
- peertime — https://github.com/rse/peertime
- 브라우저 동기화 데모(±10ms 비공식) — https://github.com/Dassderdie/synchronized-sax-gandalf
- MDN Performance.now — https://developer.mozilla.org/fr/docs/Web/API/Performance.now()
- Firefox 타이머 정밀도 — https://bugzilla.mozilla.org/show_bug.cgi?id=1313420
- WebRTC 데이터 채널 신뢰성 설정 — https://web.dev/articles/webrtc-datachannels?hl=ja , RFC 8831 https://ftp.sparcs.org/rfc/rfc8831.txt

지연 보정
- Valve Lag Compensation — https://developer.valvesoftware.com/wiki/Lag_Compensation
- Valve NPC Lag Compensation — https://developer.valvesoftware.com/wiki/NPC_Lag_Compensation
- TF2 위키 지연 보정 — https://wiki.teamfortress.com/wiki/Lag_compensation
- Overwatch 넷코드 GDC — https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and , https://gamedev.net/forums/topic/696756-command-frames-and-tick-synchronization
- 적응형 시간 지연(FDG 2026) — https://research.nvidia.com/publication/2026-08_adaptive-time-delay-improving-player-experience-and-fairness-first-person
- Claypool 지연 보정 분류 — https://web.cs.wpi.edu/~claypool/papers/lag-taxonomy/TimeDelay.html
- Brun·Safaei·Boustead, Managing latency and fairness in networked games(CACM 2006) — https://ro.uow.edu.au/articles/journal_contribution/Managing_latency_and_fairness_in_networked_games/27757545
- Tabletop Simulator 핑 보정 요청 — https://tabletopsimulator.nolt.io/1909

순서 공정성·암호
- Kelkar 외, Order-Fairness for Byzantine Consensus — https://eprint.iacr.org/2020/269
- Themis — https://eprint.iacr.org/2021/1465
- Boneh VDF 강연 정리 — https://diyhpl.us/wiki/transcripts/verifiable-delay-functions/vdf-day-2019/dan-boneh
- VDF 이론과 응용(Hoffmann 2025) — https://research-explorer.ista.ac.at/record/20920

중립 서버
- setwithfriends 규칙(서버 시각 강제) — https://github.com/ekzhang/setwithfriends/blob/main/database.rules.json
- setwithfriends `computeState`(시각순 정렬 후 다시 계산) — https://github.com/ekzhang/setwithfriends/blob/main/src/util.js
- Rules of Durable Objects — https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects
- Durable Objects 무료 요금제 — https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/
- Durable Objects 요금 — https://developers.cloudflare.com/durable-objects/platform/pricing/

사람·기기
- 육상 0.1초 부정 출발 해설 — https://www.cbsnews.com/amp/philadelphia/news/explainer-eagles-devon-allen-disqualified-hurles-world-championships
- 0.1초 기준 재검토 논문(arXiv 2025) — https://arxiv.org/html/2506.11460v1
- 시각 단순 반응 시간 연구 — https://pmc.ncbi.nlm.nih.gov/articles/PMC6916673
- 브라우저 반응 시간 측정 — https://duckware.com/tech/measure-human-visual-response-times.html
- 휴대폰 터치 지연(2013) — https://www.imore.com/iphone-5-touchscreen-latency-measured-found-be-25-times-faster-closest-android-device , https://newatlas.com/smartphone-screen-latency/29144/
- 휴대폰 26대 지연 연구(2023) — https://pubmed.ncbi.nlm.nih.gov/35953659/ , https://pmc.ncbi.nlm.nih.gov/articles/PMC9918597

게임 규칙
- UNO 설명서(Mattel) — https://service.mattel.com//instruction_sheets/HPW20-Eng.pdf
- 나이롱뽕(나무위키) — https://namu.wiki/w/%EB%82%98%EC%9D%B4%EB%A1%B1%EB%BD%95
- BGA 리치 마작 도움말(외침 우선순위) — https://en.doc.boardgamearena.com/Gamehelpriichimahjong
- 온라인 퀴즈 공정성 국내 논문(2005, 내용 미확인) — https://koreascience.or.kr/article/CFKO200533239322803.pdf
