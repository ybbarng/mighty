# 21. 새 게임 체크리스트 (2026-10-28)

새 게임을 넣을 때 이 목록을 **처음부터 끝까지** 따른다. 마이티·하트·오목을 만들며 쌓인 구성요소를 모은 것이다.
사용자가 정한 기본 요건은 넷이다. **PC·휴대폰 화면, 여러 단계 컴퓨터, 효과음, 온라인 대전**이다. 같은 날 **튜토리얼**도 더해졌다. 다섯 가운데 하나라도 빠지면 그 게임은 끝난 것이 아니다.

단계를 나눠 올려도 된다. 다만 올릴 때마다 아래 "게임별 상태" 표에 남은 칸을 적어, 실제 상태와 기록이 어긋나지 않게 한다.
새 구성요소가 생기면 이 문서에 더한다. 그 기능을 이미 있는 게임에도 넣는다(CLAUDE.md "작업 규칙").

## 1. 기획

- [ ] `docs/NN-<게임>.md`에 다음을 적는다.
  - 규칙과 규칙 종류
  - 화면 배치
  - 컴퓨터 단계
  - 시간 규칙
  - 숨길 정보
  - 순서
- [ ] 데이터 계약을 정하기 전에 다섯 질문을 본다. 계약은 규칙 문자열, 기록 형식, 온라인 메시지다.
  - 뜻
  - 지킬 규칙
  - 찾아 쓰기
  - 바뀔 때 고칠 범위
  - 대안
- [ ] 숨길 정보가 있는지 본다. 남의 패나 섞은 더미가 있으면 멘탈 포커(`packages/fair-play`)를 쓴다. 판 게임처럼 숨길 것이 없으면 쓰지 않는다(docs/18 3-2).

## 2. 엔진 `packages/<게임>-engine` (순수 함수)

- [ ] `rules.ts`
  - 규칙 타입과 기본값
  - `encode/decode<게임>Rules`: 온라인 방에서 나누는 문자열. 앞에 판 번호를 붙인다(예: `o1-`)
- [ ] `state.ts`
  - `State`, `Action`, `GameEvent`
  - `View`: 내 자리, `decision`, 숨김 처리
  - 끊긴 사람을 기다리지 않을 때 쓰는 `retire` 행동
- [ ] `match.ts`
  - `createMatch(rules, seed)`
  - `step`: 잘못된 행동은 `ok: false`와 한국어 오류
  - `viewOf`, `pendingSeats`
  - `replay`: 기록 검증·복기·무르기에 쓴다
- [ ] 튜토리얼 장면 함수(예: `createOmokScenario`): 정해진 장면에서 시작하는 상태를 만든다
- [ ] 단위 시험
  - 규칙 판정
  - 끝 판정
  - 잘못된 행동 거절
  - 다시 두기
- [ ] `package.json`·`tsconfig.json`·`vitest.config.ts`를 두고, **`Dockerfile`에 package.json COPY 줄**을 넣는다

## 3. 컴퓨터 `packages/<게임>-ai`

- [ ] 입문·중수·고수 세 단계와 `<게임>BotFor(level)`
- [ ] 세기 시험(`bots.strength.ts`): 위 단계가 아래 단계를 확실히 이기는지 잰다. 잰 결과를 기획 문서에 적는다
- [ ] 한 수에 걸리는 시간을 잰다. 휴대폰에서도 1초 안쪽이어야 한다
- [ ] 단위 시험: 합법 수만 둔다, 이기는 수를 놓치지 않는다, 막을 수를 막는다
- [ ] Dockerfile COPY 줄

## 4. 웹 연결 `apps/web/src/<게임>/`

- [ ] `kit.ts`: `GameKit`의 필수 항목을 모두 채운다. 빠지면 컴파일 오류가 난다.
  - `createMatch`, `step`, `viewOf`, `replay`, `pendingSeats`
  - `encode/decodeRules`, `startEvents`, `isOver`, `retireAction`
  - `stats`: 판·게임 요약
  - `review`: 다음 수 해설
  - `botFor`, `guestMayAct`
- [ ] `settings.ts`: 규칙·단계·고른 것을 저장(persist)한다. `StoreHydration`에서 rehydrate한다
- [ ] `store.ts`
  - `newGame`, `resume`(이어하기), `attachOnline`, `submit`(실패하면 invalid 소리)
  - `undo`(혼자 하기만), `leave`
  - `startPractice`(튜토리얼: 저장·기록·무르기 없음)
  - 컴퓨터 수는 조금 기다렸다 보인다
- [ ] `session.ts`: 온라인 방 정리

## 5. 화면

- [ ] `app/<게임>/page.tsx`: viewport themeColor
- [ ] `icon.tsx`·`apple-icon.tsx`: `IconArt`에 게임 그림을 더한다
- [ ] `opengraph-image.tsx`: 공유 그림. 공통 `gameShareImage`(게임 아이콘 + 영문 이름)를 쓴다
- [ ] `globals.css`에 `data-game` 배경을 넣는다(넘쳐 보이는 바탕색)
- [ ] `games/registry.ts`에 한 줄을 더한다: 이름, 영문 이름, 한 줄 설명, 인원, 주소
- [ ] 시작 화면
  - 위쪽: `BackToGames`, 이어하기, **배우기** 단추와 진행(n/m)
  - 고르는 것: 규칙 종류, 판 수, 컴퓨터 단계
  - 시작: 컴퓨터와 시작, **친구와 하기**
  - 아래쪽: **내 기록·지난 게임 다시 보기** 링크(`/profile?game=<id>`), 바닥글 `MadeWith`
- [ ] 대국 화면
  - 판이 끝나면 가운데에 `ResultBanner`("승리!"/"패배"/"비김")를 띄우고, 상태 줄은 `RoundOutcome` 결과 상자로 남긴다(모든 게임 같은 모양)
  - 마우스: 올리면 미리 보이고, 누르면 행동한다
  - 터치: 겨누고 다시 눌러 행동한다
  - 키보드로 움직일 수 있다
  - 상태 글은 `role="status"`
  - 휴대폰 가로(`short-landscape`)는 판을 화면 높이에 맞추고 나머지를 옆에 둔다
  - 가로로 넘치지 않는다
  - 무르기(혼자 하기), 기권, 다음 판, 다시 하기, 게임 목록 단추
- [ ] 온라인 화면
  - 판 게임은 공통 `BoardOnlineScreen`을 쓴다. 게임마다 다른 것(킷, 이름, 공유 제목, 세션, 저장소, 컴퓨터, 규칙 요약)만 `<게임>/online.ts`의 `BoardOnlineGame` 설정 객체로 넘긴다. 아래 항목은 이 화면이 모두 맡는다
  - 방장은 `HostRoom`, 참가자는 `GuestRoom`
  - 초대 링크(`?room=`)로 들어온다. 방장이 새로고침하면 `hostedRoom(<id>)`로 다시 연다
  - 끊긴 사람 대신 컴퓨터가 둔다(`standInDelayMs`)
  - 연결 끊김 띠와 `ChatBox`
  - 참가자는 판 끝 검증(audit)을 통과하면 `saveGuestArchive`로 기록을 받는다

## 6. 소리

- [ ] 게임의 손맛 소리를 `game/sound.ts`의 `Cue`에 더한다. 예: 돌 놓기, 카드 내기. 라벨, `TRIM_DB`, 합성을 넣는다
- [ ] 이김·짐·판 끝·잘못된 행동은 공통 소리를 쓴다(`cuesFor`)
- [ ] `/sounds` 시험판(SoundBoard)에 그 게임 묶음을 더한다. `sounds.spec`의 크기 확인을 통과해야 한다
- [ ] 원작 효과음은 쓰지 않는다. 라이선스가 없다(docs/16)

## 7. 기록과 복기

- [ ] 혼자 하기와 방장은 `StatsRecorder`·`ArchiveRecorder`로 남긴다
- [ ] `stats/ProfilePage.tsx`에 탭과 통계 화면을 더한다
- [ ] `review/ReviewPage.tsx`
  - `GAME_NAME`에 더한다
  - 다시 보기 화면: 처음·한 수 뒤로·앞으로·끝, 자동 재생, ←→ 키
  - 해설

## 8. 튜토리얼

- [ ] `<게임>/tutorial.ts`: 단원(`Lesson`)을 쓴다.
  - 단원은 설명 → 퀴즈 → 미션이다
  - 첫 단원은 "어떤 게임?", 마지막 단원은 처음부터 한 판 하는 실전이다
  - 판 게임은 설명과 퀴즈에 `scene`(판 그림)을 붙인다
- [ ] `components/<게임>-tutorial.tsx`: `TutorialKit`을 채운다
  - `startMission`, `subscribe`, `Table`(미션 띠를 얹은 대국 화면)
  - 판 그림을 보이는 `Scene`
- [ ] `tutorial/progress.ts`에 진행 기록을 두고 `StoreHydration`에서 rehydrate한다
- [ ] 단위 시험: 미션마다 `solution`이면 성공, `mistake`면 실패. 장면을 모두 만들 수 있다. 퀴즈 정답 번호가 보기 안에 있다
- [ ] 미션 대국은 이어하기 저장, 내 기록, 복기에 남기지 않는다

## 9. 시간 (차례가 있는 판 게임)

- [ ] 개인 시간을 고를 수 있다: 없음(기본) / 기본 시간 + 초읽기. 시간패를 판정한다. 공통 틀은 docs/24: 엔진 상태에 `clocks`, 행동에 `spent`, `GameKit.timing`, 화면은 `GameClock`·`TimePresetPicker`
- [ ] 온라인은 방장이 시계를 잰다. 시간이 다 되면 행동으로 기록에 남긴다. 남은 시간은 화면에 실어 보낸다(docs/20 1절)

## 10. 시험과 확인

- [ ] 제한 시간이 있는 코드는 `Clock`을 받는다(기본 `realClock`). 시험은 `ManualClock`을 넣고 `advance`로 시간을 옮긴다. 시험에서 실제 시간을 기다려 결과를 얻지 않는다(CLAUDE.md "flaky 시험은 두지 않는다")
- [ ] 기다림은 조건으로 한다. 기록 저장처럼 비동기인 것도 "쓰였는지"를 확인한 뒤 넘어간다(예: `omok.spec`의 `finishedOmokGames`)
- [ ] 화면 시험 `e2e/<게임>.spec.ts`. 세 화면 크기(desktop, phone-portrait, phone-landscape)에서 돈다.
  - 목록에서 들어가 입문 컴퓨터와 한 판을 끝까지 한다
  - 가로로 넘치지 않는다
  - 새로고침 뒤 이어하기가 된다
  - 온라인: 두 탭(`?net=local`)으로 한 판을 하고, 판 끝 검증을 확인한다
  - 끝낸 판이 내 기록과 복기에 보인다
  - 배우기: 단원을 끝내고, 미션은 실패한 뒤 다시 해서 성공한다
- [ ] 스크린숏을 직접 본다(시작, 대국, 미션, 판 끝, 휴대폰 가로)
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`
- [ ] push 뒤 Image와 CI가 성공하는지 보고, 실제 `game.byb.kr/<게임>`을 연다

## 11. 문서

- [ ] 기획 문서의 순서 칸을 끝으로 바꾼다
- [ ] `docs/00-handoff.md`와 CLAUDE.md 머리말의 게임 목록을 고친다
- [ ] 아래 "게임별 상태" 표를 고친다

## 게임별 상태

| 항목 | 마이티 | 하트 | 오목 | 장기 | 체스 | 바둑 | 나이롱뽕 | 고스톱 | 민화투 |
|---|---|---|---|---|---|---|---|---|---|
| PC·휴대폰 화면 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 첫 화면(GameHome) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 판 끝 결과(가운데 띠 + 결과 상자) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 컴퓨터 단계 | ✅ | ✅ | ✅ 셋 | ✅ 셋 | ✅ 셋 | ✅ 셋 | ✅ 셋 | ✅ 셋 | ✅ 셋 |
| 효과음 | ✅ | ✅ | ✅ | ✅ | ✅ (장기 소리) | ✅ (오목·장기 소리) | ✅ | ✅ | ✅ |
| 온라인 대전 | ✅ 멘탈 포커 | ✅ 멘탈 포커 | ✅ | ✅ | ✅ | ✅ | ✅ 방장 시드(멘탈 포커는 다음) | ✅ 방장 시드(멘탈 포커는 다음) | ✅ 방장 시드(멘탈 포커는 다음) |
| 튜토리얼 | ✅ 10단원 | ✅ | ✅ 5단원 | ✅ 6단원 | ✅ 8단원 | ✅ 7단원 | ✅ | ✅ 6단원 | ✅ 6단원 |
| 내 기록·복기 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 아이콘 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 공유 그림 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 개인 시간 | 해당 없음 | 해당 없음 | ✅ (docs/24) | ✅ (docs/24) | ✅ (docs/24) | ✅ (docs/24) | 해당 없음 | 해당 없음 | 해당 없음 |

공통 정리: 오목·장기·체스·바둑의 온라인 화면은 공통 `BoardOnlineScreen` 하나로 묶었다(2026-10-29). 화투 세 게임의 온라인 화면도 거의 같은 코드라, 멘탈 포커로 옮긴 뒤 같은 식으로 묶을 수 있다.
