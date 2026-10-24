# 16. 원작 효과음 조사 (2026-10-22)

> 원작 Mighty Network 4.0(`skyser2003/mighty40`)이 어떤 상황에 어떤 효과음을 냈는지, 2019년 `legacy/`가 그 파일을 어디에 썼는지, 지금 앱이 무엇을 내는지 정리한다.
> `legacy/` 폴더는 2026-10-22에 지웠다(2019년 코드는 비공개 `ybbarng/mighty-archive`의 태그 `legacy-2019`). 효과음 파일 18개는 이름 그대로 비공개 `ybbarng/mighty-archive`의 `assets/original-sounds/`에 있다(이 공개 저장소와 배포 이미지에는 넣지 않는다). 아래 `legacy/src/...` 경로는 비공개 `ybbarng/mighty-archive`의 태그 `legacy-2019`에서 본다.

표기: **[확인]** 소스에서 직접 본 것, **[추정]** 소스를 읽고 짐작한 것(실제로 돌려 보지는 않았다).

## 결론

1. **legacy의 효과음 18개는 원작 `res/*.wav` 18개와 바이트까지 같다.** git blob 해시가 모두 일치한다. 파일 이름만 영어로 바꿨다(`마이티.wav` → `mighty.wav` 등).
2. **원작은 상황마다 소리를 꽤 세밀하게 나눴다.** 카드를 낼 때만 다섯 갈래(마이티, 조커콜, 죽은 조커, 조커, 찍기(기루다로 자르기), 그 밖)로 나누고, 공약·포기·딜미스·당선 공지·버릴 카드 정리·키티 받기·야당 득점·승리·패배·버튼 클릭까지 소리가 있다. 소리 재생은 `Mighty.cpp`의 `PlaySound(UINT idWave, BOOL bStop)` 하나로 모이고, 대부분 `PlayerHuman.cpp`에서 부른다.
3. **원작에도 소리가 없는 상황이 있다.** 프렌드 공개(글자만 띄운다), 트릭을 가져갈 때(점수 카드가 야당으로 갈 때만 `득점.wav`), 일반 딜(카드 나눠 주기). 판 시작의 "짝!"(`IDW_CARDSETUP`)은 코드에서 부르지만 리소스가 없어 소리가 나지 않는다 [추정].
4. **legacy는 18개 중 7개만 실제로 울렸다.** 공약(`bid`), 포기(`abandon_bid`), 카드 내기 다섯 종(`mighty`, `joker`, `hunted_joker`, `joker_hunter`, `gan`, `card`), 섞기(`shuffling`). 당선·승패·버튼·득점 등은 매핑만 만들고 부르지 않았다.
5. **지금 앱은 음원 없이 Web Audio로 합성한 24가지 소리를 낸다**(2026-10-24 다시 만듦, 4절). 원작이 소리를 내던 장면을 모두 채웠고, 카드 소리는 원작 `PlayTurnSound` 판정을 그대로 따른다.
6. **원작 효과음은 라이선스가 없고 출처도 불분명하다**(나무위키는 코에이 "삼국지 조조전"에서 왔다고 추정, docs/02 참고). 비공개 `ybbarng/mighty-archive`에만 보관하고, **공개 저장소(이곳)나 공개 배포(mighty.byb.kr)에는 넣지 않는다.**

## 1. 원작 효과음 파일 목록

모두 RIFF WAV, 모노, PCM. 형식과 길이는 `afinfo`로 쟀다. 모두 합쳐 941,729바이트(약 920KiB).

| 원작 파일 (`res/`) | 리소스 ID | legacy 파일 (`assets/original-sounds/`) | 형식 | 크기(B) | 길이(초) | 원작에서 쓰인 상황 [확인] | legacy에서 쓰인 곳 |
|---|---|---|---|---:|---:|---|---|
| 게임시작.wav | `IDW_BEGIN` | game_start.wav | 22,050Hz 16비트 | 75,270 | 1.71 | 한 판 시작("초대 선거", "제 N 대 대선" 표시와 함께). "솨악!" | `GAME_START` 매핑만, 재생 안 함 |
| 공지.wav | `IDW_NOTIFY` | announcement.wav | 22,050Hz 16비트 | 74,546 | 1.69 | 주공 당선 공지, 선거 끝(공약·프렌드 확정 공지). "짠~" | `ELECTED`, `FRIEND_SELECTED` 매핑만, 재생 안 함 |
| 공약.wav | `IDW_GOAL` | bid.wav | 22,050Hz 8비트 | 22,444 | 1.02 | 누군가 공약(출마)을 낼 때 | 공약(`bid` move) 때 재생 |
| 포기.wav | `IDW_GIVEUP` | abandon_bid.wav | 22,050Hz 8비트 | 9,132 | 0.41 | 출마 포기, 6마 죽이기 헛다리. 코드 주석은 "뽀록 소리" | 포기(`abandonBid` move) 때 재생 |
| 카드셋.wav | `IDW_CARDSET` | cardset.wav | 22,050Hz 8비트 | 4,950 | 0.22 | 딜미스, 주공이 버릴 카드를 확정해 손패를 정리할 때 | `CARDSET` 매핑만, 재생 안 함 |
| 카드받기.wav | `IDW_GETCARD` | receiving_card.wav | 11,025Hz 8비트 | 3,036 | 0.27 | 주공이 키티(남은 카드)를 받을 때 한 장마다, 버릴 카드를 고르며 카드를 누를 때 | `RECEIVING_CARD` 매핑만, 재생 안 함 |
| 섞기.wav | `IDW_SUFFLE` | shuffling.wav | 11,025Hz 8비트 | 6,181 | 0.56 | 판 시작 섞기 연출. 2번 섞으니 2번 울린다 | 섞기 연출 때 600ms 간격으로 2번 재생 |
| 카드.wav | `IDW_CARD` | card.wav | 11,025Hz 8비트 | 1,516 | 0.13 | 일반 카드 내기(아래 특수 경우가 아닐 때) | 일반 카드 내기 |
| 마이티.wav | `IDW_MIGHTY` | mighty.wav | 22,050Hz 8비트 | 43,294 | 1.96 | 마이티를 낼 때 | 마이티를 낼 때 |
| 조커.wav | `IDW_JOKER` | joker.wav | 22,050Hz 8비트 | 40,700 | 1.84 | 효력 있는 조커를 낼 때 | 효력 있는 조커 |
| 조커콜.wav | `IDW_JOKERCALL` | joker_hunter.wav | 22,050Hz 8비트 | 60,904 | 2.76 | 선이 조커콜을 실제로 불렀을 때, 6마에서 주공이 한 명을 죽이려 할 때 | 조커콜 카드를 효력 있게 냈을 때 |
| 죽은조커.wav | `IDW_KILLEDJOKER` | hunted_joker.wav | 22,050Hz 8비트 | 37,876 | 1.72 | 조커콜이 걸린 트릭에서 조커를 낼 때(조커가 힘을 잃음) | 효력 없는 조커 |
| 찍기.wav | `IDW_KIRUDA` | gan.wav | 22,050Hz 8비트 | 36,730 | 1.66 | 선 무늬가 없어 기루다로 자를 때(찍기·겐) | `isGan`일 때 |
| 득점.wav | `IDW_SCORE` | scored.wav | 22,050Hz 8비트 | 22,740 | 1.03 | 트릭 끝에 점수 카드가 야당(주공·공개된 프렌드가 아닌 쪽) 득점 칸으로 날아갈 때 한 장마다. 2마는 규칙이 다르다 | `SCORED` 매핑만, 재생 안 함 |
| 승리.wav | `IDW_WIN` | victory.wav | 22,050Hz 8비트 | 264,248 | 11.97 | 판 결과 창에서 내가 이겼을 때 | `VICTORY` 매핑만, 재생 안 함 |
| 패배.wav | `IDW_LOSE` | defeated.wav | 22,050Hz 8비트 | 226,280 | 10.25 | 판 결과 창에서 내가 졌을 때 | `DEFEATED` 매핑만, 재생 안 함 |
| 삑.wav | `IDW_BEEP` | beep.wav | 22,050Hz 8비트 | 1,686 | 0.07 | 대화 상자 버튼 클릭, 닫기(x) 버튼, 공약·프렌드·죽이기 창에서 무늬·점수·카드를 고를 때 | `BUTTON` 매핑만, 재생 안 함 |
| 철컥.wav | `IDW_CHULK` | click.wav | 22,050Hz 8비트 | 10,196 | 0.46 | 시작 화면 메뉴 클릭 | `MAIN_MENU` 매핑만, 재생 안 함 |

원작 `Resource.h`에는 `IDW_SUFFLE2`, `IDW_GETCARD2`, `IDW_KILLDEDJOKER`(오타), `IDW_CARDSETUP`도 정의돼 있지만 `Mighty.rc`에 WAVE 리소스가 없다. 이 중 코드에서 부르는 것은 `IDW_CARDSETUP`("짝!")뿐이다.

## 2. 원작이 소리를 내는 방식 [확인]

- `Mighty.cpp` `PlaySound(UINT idWave, BOOL bStop)`: 옵션 `bUseSound`가 켜져 있을 때만 Win32 `PlaySound`를 `SND_ASYNC|SND_NODEFAULT|SND_NOWAIT|SND_RESOURCE`로 부른다. `bStop`이 거짓이면 `SND_NOSTOP`을 더한다.
  - Win32 `PlaySound`는 한 번에 한 소리만 낸다. `bStop=true`인 소리는 앞 소리를 끊고, `bStop=false`인 소리(카드, 죽은 조커, 삑, 딜미스의 카드셋)는 다른 소리가 나고 있으면 울리지 않는다. 즉 **카드.wav 같은 흔한 소리는 낮은 우선순위**다. 코드 주석에도 "죽은 조커는 소리 우선순위가 낮게"라고 적혀 있다.
  - `SND_NODEFAULT`라서 리소스가 없으면 기본 경고음도 나지 않는다. 그래서 `IDW_CARDSETUP`은 무음일 것이다 [추정].
- 잘못된 조작(낼 수 없는 공약, 버릴 카드 수가 틀림, 빈 곳 클릭, 접속 종료 안내)에는 wav가 아니라 Windows 경고음 `MessageBeep`을 쓴다.
- 소리 켜기/끄기는 옵션 대화 상자의 "Sound" 체크 하나뿐이고 음량 조절은 없다.

## 3. 상황별 비교

"원작 소리"의 근거 위치는 6절 표를 본다. legacy의 "매핑만"은 `Sound.js`에 이름만 있고 부르는 곳이 없다는 뜻이다. "지금 앱 소리" 열은 2026-10-24에 다시 만들기 전 상태다. 지금 소리는 4절 표를 본다.

| 상황 | 원작 소리 | legacy 소리 | 지금 앱 소리 | 원작 소리로 바꿀 때 메모 |
|---|---|---|---|---|
| 시작 화면 메뉴 클릭 | 철컥.wav [확인] | 없음(`MAIN_MENU` 매핑만) | 없음 | 메뉴 버튼에 붙인다. 화면 전환 직후라 첫 소리 허용(사용자 조작) 조건은 맞는다 |
| 대화 상자 버튼·고르기 | 삑.wav [확인] | 없음(`BUTTON` 매핑만) | 없음 | 0.07초라 부담이 적다. 모든 버튼에 붙이면 시끄러울 수 있어 공약·프렌드 고르기 창 정도만 권한다 |
| 판 준비 "짝!" | 부르지만 리소스 없음, 무음 [추정] | 없음 | 없음 | 넣을 것 없음 |
| 섞기 | 섞기.wav × 2 (섞기 연출 두 번) [확인] | shuffling.wav × 2, 600ms 간격 [확인] | `shuffle`(잡음 14번 합성), `dealt` 이벤트에서. 2마는 뺀다 | legacy처럼 두 번 울리면 원작과 같다. 섞기 연출 시간에 맞춘다 |
| 판 시작("제 N 대 대선") | 게임시작.wav [확인] | 없음(`GAME_START` 매핑만) | 없음(`roundStarted`는 소리 없음) | `roundStarted`에 새 `Cue`를 둔다. 섞기와 겹치지 않게 섞기 뒤에 낸다 |
| 카드 나눠 주기 | 없음 [확인] | 없음 | 없음(섞기 소리만) | 원작도 없다 |
| 공약(출마) | 공약.wav [확인] | bid.wav [확인] | `bid` | 그대로 바꾸면 된다. 1초 길이라 컴퓨터가 빨리 연달아 내면 끊긴다(원작도 `bStop=true`로 끊었다) |
| 출마 포기(패스) | 포기.wav [확인] | abandon_bid.wav [확인] | `pass` | 그대로 바꾸면 된다 |
| 딜미스(개인·전체) | 카드셋.wav. 앞에 부르는 `IDW_CARDSETUP`은 무음 [확인/추정] | 없음 | `dealMiss`(`dealMiss`, `allPassed` 이벤트) | 원작은 모두 포기해서 생기는 딜미스에서 포기.wav 뒤에 카드셋.wav를 `SND_NOSTOP`으로 부르므로 카드셋이 묻힐 수 있다 [추정]. 웹에서는 둘 다 들리게 해도 된다 |
| 주공 당선 | 공지.wav [확인] | 없음(`ELECTED` 매핑만) | `elected` | 그대로 바꾸면 된다 |
| 6마 죽이기 시도 | 조커콜.wav [확인] | 기능 없음 | 없음(`killAttempt` 이벤트에 소리 없음) | `killAttempt`에 조커콜.wav |
| 6마 죽이기 헛다리 | 조커콜.wav 뒤 잠시 쉬고 포기.wav [확인] | 기능 없음 | 없음 | `killAttempt.killed === null`일 때 포기.wav를 이어서 낸다 |
| 주공이 키티 받기 | 카드받기.wav, 한 장마다 [확인] | 없음(`RECEIVING_CARD` 매핑만) | 없음(`kittyTaken` 이벤트에 소리 없음) | `kittyTaken.count`만큼 짧게 이어서 내거나 한 번만 낸다 |
| 버릴 카드 고르기(카드 누름) | 카드받기.wav [확인] | 없음 | 없음 | 내 손패에서 버릴 카드를 토글할 때 |
| 버릴 카드 확정(손패 정리) | 카드셋.wav [확인]. 사람 주공일 때만 | 없음(`CARDSET` 매핑만) | 없음(`exchanged` 이벤트에 소리 없음) | `exchanged`에 붙인다. 컴퓨터 주공일 때도 낼지는 고른다 |
| 선거 끝(공약·프렌드 확정 공지) | 공지.wav [확인] | 없음(`FRIEND_SELECTED` 매핑만) | 없음(`friendDeclared`에 소리 없음) | `friendDeclared`에 공지.wav. 당선 공지와 같은 소리라 두 번 들린다(원작 그대로) |
| 일반 카드 내기 | 카드.wav, 낮은 우선순위 [확인] | card.wav [확인] | `card` | 그대로. 0.13초. 원작처럼 다른 큰 소리를 끊지 않게 한다 |
| 마이티 | 마이티.wav [확인] | mighty.wav [확인] | `mighty` | 그대로 |
| 조커(효력 있음) | 조커.wav. 선이면 무늬 지정 글자도 띄움. 이미 효력 있는 마이티가 깔려 있으면 카드.wav [확인] | joker.wav(`hasPower`) [확인]. 마이티 예외는 없음 | `joker` | 마이티 예외를 따를지 정한다. 엔진에서 "효력 있는 조커인지"를 알아야 한다 |
| 조커콜(선이 실제로 부름) | 조커콜.wav + "조커 콜 !" 글자 [확인] | joker_hunter.wav(`hasPower`) [확인] | `jokerCall`(`played.jokerCall`) | 그대로. 조커콜 카드를 내되 부르지 않으면 원작은 카드.wav + "조커콜 아님" |
| 죽은 조커(조커콜에 걸림) | 죽은조커.wav, 낮은 우선순위 [확인] | hunted_joker.wav [확인] | `joker`(효력 구분 없음) | `Cue`를 새로 나눠야 한다. 이 트릭에 조커콜이 걸렸는지 알아야 한다 |
| 찍기(기루다로 자르기) | 찍기.wav. 선이 기루다가 아니고, 효력 있는 마이티·조커가 깔려 있지 않을 때 [확인] | gan.wav(`isGan`). 마이티·조커 예외 없음 [확인] | `card`(구분 없음) | `Cue`를 새로 나눠야 한다. 원작 ReadMe에 "마이티/조커 뒤 기루로 찍으면 소리 나던 것 수정"이 있으니 예외까지 따른다. 선이 조커이고 조커 무늬가 기루다면 찍기가 아니다 |
| 트릭 가져가기 | 없음. 점수 카드가 야당 득점 칸으로 갈 때만 득점.wav, 한 장마다 [확인] | 없음(`SCORED` 매핑만) | `trick`(쓸리는 잡음), 트릭마다 | 바꾸면 소리가 나는 때가 달라진다. "야당이 점수 카드를 먹을 때"만 득점.wav를 내고 그 밖의 트릭은 무음 또는 지금 `trick`을 남긴다 |
| 프렌드 공개 | 없음. "프랜드" 글자만 띄움 [확인] | 없음 | `friend`(높은 종소리) | 원작에는 해당 소리가 없다. 지금 소리를 남기거나 공지.wav를 빌린다 |
| 판 끝 승리 | 승리.wav(12초), 결과 창을 띄울 때 [확인] | 없음(`VICTORY` 매핑만) | `win`(`roundScored`, 내가 주공 편이고 주공 편이 이기면 등) | 12초로 길다. 결과 창을 닫거나 다음 판으로 넘어가면 멈춰야 한다 |
| 판 끝 패배 | 패배.wav(10초) [확인] | 없음(`DEFEATED` 매핑만) | `lose` | 위와 같다 |
| 구경꾼(옵저버) 승패 | 주공 편 기준으로 승리/패배 [확인] | 없음 | 지금은 `view.seat` 기준 | 구경 모드가 생기면 원작처럼 주공 기준으로 |
| 낼 수 없는 카드·잘못된 조작 | Windows `MessageBeep` [확인] | 없음 | `invalid`(낮은 합성음), `GameTable.tsx` | 원작 wav가 없으니 지금 합성음을 남긴다 |
| 게임 끝(파산 등) | 별도 소리 없음 [추정] | 없음 | 없음(`gameOver`에 소리 없음) | — |
| 2마 카드 고르기 | 고르기 창 클릭은 무음(`D2MA`가 `OnClickSound`를 비움), 무늬 버튼만 삑 [확인] | 기능 없음 | 없음(`picked` 이벤트에 소리 없음) | — |
| 음량 조절 미리 듣기 | 음량 조절 없음 | 없음 | `card`(`SettingsMenu.tsx`, `OptionsScreen.tsx`) | 원작 카드.wav로 바꿔도 된다 |

숨은 하트(`apps/web/src/hearts/store.ts`)도 같은 `Cue`를 빌려 쓴다(스페이드 Q에 `mighty`, 하트가 깨질 때 `friend`). 원작 마이티 소리로 바꾸면 하트에서도 그 소리가 나니, 하트용 매핑을 따로 둘지 함께 정한다.

## 4. 지금 앱의 효과음 [확인] (2026-10-24 다시 만듦)

"카드·섞기 소리가 벌레 바스락거리는 소리 같다"는 의견으로 소리를 모두 새로 합성했다. 높은 대역(2.5~3.2kHz)의 잡음을 짧게 끊어 낸 것이 원인이어서, 카드 소리는 낮은 대역 잡음과 짧게 떨어지는 낮은 음("톡")으로 바꾸고 모든 소리에 작은 방 울림을 더했다. 원작 wav는 쓰지 않는다(5절).

- `apps/web/src/game/sound.ts`: `Cue` 27종과 합성. `play(cue, { delay, times })`는 AudioContext 시간으로 예약해서 낸다. 큰 소리(`BIG`)끼리는 앞 소리를 줄여 끊는다(원작은 한 번에 한 소리). 첫 누름(`pointerdown`·`keydown`·`touchend`)에서 AudioContext를 열어 두어 iOS에서 첫 소리가 막히지 않게 한다. `renderCue`는 소리를 재생하지 않고 그려 본다.
- `apps/web/src/game/cues.ts` `cuesFor(view, events)`: 엔진 이벤트를 소리로 바꾼다. 카드 소리는 원작 `PlayTurnSound` 판정을 그대로 따른다. 같은 스냅숏 안의 같은 소리는 하나로 줄인다.
- `apps/web/src/hearts/cues.ts` `heartsCuesFor`: 하트용 매핑.
- `apps/web/src/game/ui-sound.ts` `playUiCue`: 화면 조작 소리. 소리 설정이 꺼져 있으면 내지 않는다.
- `/sounds`(`components/SoundBoard.tsx`): 모든 소리를 들어 보고 크기와 길이를 비교하는 미리 듣기 화면. 크기는 귀에 느껴지는 정도(0.15초 구간 평균 크기의 가장 큰 값)와 가장 큰 순간을 함께 보인다.
- 크기 맞추기(`TRIM_DB`): 갑자기 커서 놀라지 않게 소리마다 크기를 맞춘다. 귀에 느껴지는 크기로 평범한 소리는 -33~-38dB, 중요한 소리(마이티·조커·찍기·프렌드 등)는 -29dB 근처라 평범한 카드보다 6~7dB만 크다. 가장 큰 순간은 모두 -15dB 아래다. 화면 시험 `e2e/sounds.spec.ts`가 전체 차이 12dB, 카드보다 9dB, 가장 큰 순간 -13dB를 넘지 않는지 확인한다. 압축기 문턱을 낮추면 브라우저가 전체를 자동으로 키우므로(makeup gain) 문턱은 그대로 두고 맞춤값으로만 조절한다.

| 장면 | `Cue` | 소리 | 어디서 |
|---|---|---|---|
| 섞기 | `shuffle` | 덱이 갈라질 때 "스윽", 합쳐질 때 촘촘히 맞물리는 "촤르르륵 착". 연출(0.4초마다 갈라짐·합쳐짐)에 맞춰 두 번 | `dealt`(2마·움직임 줄이기 제외, 섞는 연출을 이미 보였으면 뺀다), `redealtForDead` |
| 나눠 주기 | `deal` | 묶음이 날아가는 "슥"과 손에 닿는 "톡". 원작에는 없다 | `dealt`에서 묶음마다(`dealCues`, 하트 포함) |
| 판 시작 | `gameStart` | "솨악" 바람 소리 뒤 세 음 | 나눠 주기가 끝날 때(2마는 `roundStarted`, 움직임 줄이기는 바로) |
| 공약 | `bid` | 마림바 "띠링" | `bid` |
| 포기 | `pass` | 김 빠지는 "뽁" | `passed`, 죽이기 헛다리 0.75초 뒤 |
| 딜미스 | `dealMiss` | 카드 "착착" + 낮은 음 | `dealMiss`, `allPassed` |
| 당선·선거 끝 | `announce` | 종 화음 "짠~" | `elected`, `friendDeclared` |
| 죽이기 | `kill` | 북을 몰아치다 칼 "슉" | `killAttempt` |
| 키티 받기 | `pickCard` | 가벼운 "톡", 장수만큼 | `kittyTaken`, 버릴 카드·넘길 카드 고르기 |
| 버릴 카드 확정 | `cardSet` | 카드 "착착" | 내가 주공일 때 `exchanged`, 하트 `passed` |
| 평범한 카드 | `card` | 낮은 "톡" | `played` |
| 마이티 | `mighty` | 금관 "빠-밤!" + 큰북 + 반짝임 | `played`(마이티면 효력과 상관없이) |
| 조커 | `joker` | 장난스럽게 "뾰로롱" + 키득 세 번 | 힘 있는 조커. 힘 있는 마이티가 깔려 있으면 `card` |
| 조커콜 | `jokerCall` | 경보 "삐뽀삐뽀" | `played.jokerCall` |
| 죽은 조커 | `deadJoker` | 바람 빠지는 "뿌우웅" | 힘을 잃은 조커(조커콜에 걸림, 첫·마지막 트릭 규칙) |
| 찍기(간) | `gan` | 내리찍는 "쾅!" + 쇳소리 | 선 무늬가 기루다가 아닌데 기루다를 냄. 힘 있는 마이티·조커가 깔려 있거나 선이 기루다(조커 선의 지정 무늬 포함)면 아니다 |
| 프렌드 공개 | `friend` | 하프처럼 올라간 뒤 반짝이는 화음 | `friendRevealed`. 카드를 낸 같은 장면이면 0.6초 뒤 |
| 야당 득점 | `scored` | 동전 "띵-딩", 점수 카드 장수만큼 | `trickWon`에서 야당이 점수를 가져갈 때, 카드를 모으는 1.1초 뒤. 2마 제외 |
| 승리·패배 | `win`·`lose` | 금관 팡파르 / 처지는 트롬본 | `roundScored` |
| 낼 수 없는 카드 | `invalid` | 낮은 두 음 | `GameTable`·`HeartsTable` |
| 메뉴 | `click` | 기계 "철컥" | 시작 화면 메뉴(마이티·하트) |
| 고르기 | `beep` | 짧은 "틱" | 공약·특권·프렌드·죽이기 창의 무늬·점수·카드·프렌드 고르기(`panels/common.tsx`, `FriendPanel`) |
| 하트: 스페이드 Q | `queenOfSpades` | 불길한 "둥, 둥, 두웅~" | 하트 `played` |
| 하트: 하트 깨짐 | `heartsBroken` | 유리 "쨍그랑" | 하트 `heartsBroken` |
| 하트: 벌점 먹음 | `penalty` | 아쉽게 내려가는 "뿌우" | 내가 점수 카드(하트·♠Q)가 든 트릭을 가져갈 때. 남이 가져가면 조용히 둔다 |
| 하트: 점수 깎는 카드 | `scored` | 동전 "띵-딩" | 내가 ◆J처럼 점수를 깎는 트릭을 가져갈 때 |
| 하트: 판 끝 | `roundEnd` | 종이 "사락"과 "띵동" | `roundScored`. 마지막 판이면 승리·패배만 |
| 하트: 문 | `mighty` · `queenOfSpades` | 내가 먹으면 팡파르, 남이 먹으면(나에게 벌점) 불길한 소리 | 하트 `roundScored.moonShooter` |

원작과 다르게 둔 것: 원작은 트릭을 가져갈 때 득점이 없으면 소리가 없어서, 지금도 따로 소리를 내지 않는다(예전 `trick` 소리는 뺐다). 프렌드 공개는 원작에 소리가 없지만 중요한 장면이라 전용 소리를 두었다. 원작은 첫 트릭처럼 규칙 때문에 힘이 없는 조커에도 조커 소리를 냈지만, 여기서는 죽은 조커 소리를 낸다.

## 5. 원작 효과음을 다시 쓸 때 주의

- **라이선스가 없다.** 원작 저장소에 LICENSE가 없고, 효과음 출처 표기도 없다(코에이 게임에서 가져왔다는 추정이 있다). 권리가 확인되지 않은 파일이다.
  - 파일은 비공개 `ybbarng/mighty-archive`에만 둔다. 이 저장소는 2026-10-25에 원작 효과음을 기록까지 빼고 공개했다.
  - **저장소를 공개하거나, 공개 사이트(mighty.byb.kr) 빌드에 넣지 않는다.** 다시 넣지 않도록 `.gitignore`에 `assets/original-sounds/`를 두었다.
  - 개인용으로만 쓰려면 "내 브라우저에서 파일을 골라 넣으면 그 소리로 바꾼다" 같은 방식이 안전하다. 앱에는 파일을 싣지 않는다.
  - 공개판에는 지금 합성음을 쓰거나, CC0 등 라이선스가 분명한 효과음을 새로 구한다(docs/03 M4 계획과 같다).
- **원작 코드는 옮기지 않는다.** 위 조건(언제 어떤 소리)은 동작만 참고해 새로 짠다.
- **형식**: 대부분 8비트 PCM, 11/22kHz 모노 WAV다. 브라우저 `decodeAudioData`는 8비트 PCM WAV도 읽지만, 옮길 때 Opus/OGG나 MP3로 바꾸면 크기가 줄어든다(지금 합계 약 920KiB, 승리·패배 두 개가 절반 넘게 차지한다). 바꿀 때 원본은 따로 남긴다.
- **재생 방식**: 원작은 한 번에 한 소리만 냈고 흔한 소리(카드, 죽은 조커, 삑)는 다른 소리를 끊지 않았다. Web Audio는 여러 소리가 겹치므로, 큰 소리(마이티·조커·조커콜·공지)가 날 때 앞 소리를 줄이거나 우선순위를 두면 원작 느낌에 가깝다.
- **긴 소리**: 승리(12초)·패배(10초)는 결과 창을 닫거나 다음 판으로 넘어갈 때 멈춰야 한다. 컴퓨터끼리 빨리 진행할 때 공약(1초)·공지(1.7초)가 겹치지 않게 한다.
- **첫 소리 제한**: 브라우저는 사용자 조작 전 소리를 막는다. 지금처럼 첫 소리에서 `AudioContext`를 만들고, 파일은 그 뒤 미리 받아 `AudioBuffer`로 디코딩해 둔다.
- **음량**: 원작 파일은 지금 합성음보다 크다. legacy는 0.05까지 낮췄다. 파일마다 크기를 맞추거나 전체 음량을 낮춰 시작한다.
- **옮긴 뒤 경로**: 1번 표의 legacy 파일 이름(`mighty.wav` 등)을 그대로 쓰면 이 문서와 맞추기 쉽다. 옮긴 뒤 이 문서의 경로를 새 위치로 바꾼다.

## 6. 출처

### 이 저장소

| 내용 | 위치 |
|---|---|
| legacy 효과음 매핑과 재생 함수 `playSound`(음량 0.05) | `legacy/src/components/Sound/Sound.js` |
| legacy 효과음 파일 18개 | 비공개 `ybbarng/mighty-archive`의 `assets/original-sounds/*.wav` |
| 공약·포기·카드 내기 소리 고르기 (`playBidSound`, `playCardSound`) | `legacy/src/components/Board/Board.js` 44~65행, 247~279행 |
| 섞기 소리 두 번 (`playShuffleSound`) | `legacy/src/components/CenterZone/CenterZone.js` 58행, 67~72행 |
| `specialCardName`, `hasPower`, `isGan` 계산 | `legacy/src/core/Game.js` 235~271행 |
| 지금 앱 합성음 | `apps/web/src/game/sound.ts` |
| 이벤트→소리 매핑 | `apps/web/src/game/cues.ts` |
| 소리 재생 시점 | `apps/web/src/game/store.ts` `advance()` |
| 하트 매핑 | `apps/web/src/hearts/store.ts` `cuesFor` |
| 엔진 이벤트 종류 | `packages/engine/src/state.ts` `GameEvent` |
| 원작 효과음 라이선스 메모 | `docs/02-research.md` 1절, `docs/06-backlog.md` |

### 원작 (`skyser2003/mighty40`, 커밋 `c419c011aba6fb46ee73112bbc37be40dbbe516c`, CP949 인코딩)

저장소: <https://github.com/skyser2003/mighty40>. 행 번호는 위 커밋 기준이다.

| 내용 | 파일·함수 |
|---|---|
| 효과음 파일 | [`res/*.wav`](https://github.com/skyser2003/mighty40/tree/master/res) |
| 리소스 ID 정의 | [`Resource.h`](https://github.com/skyser2003/mighty40/blob/master/Resource.h) 8~29행 |
| WAVE 리소스와 파일 연결 | [`Mighty.rc`](https://github.com/skyser2003/mighty40/blob/master/Mighty.rc) 145~165행 |
| 재생 함수 `PlaySound(idWave, bStop)` | [`Mighty.cpp`](https://github.com/skyser2003/mighty40/blob/master/Mighty.cpp) 93~98행 |
| 카드 낼 때 소리 고르기 `CPlayerHuman::PlayTurnSound` | [`PlayerHuman.cpp`](https://github.com/skyser2003/mighty40/blob/master/PlayerHuman.cpp) 152~212행, 부르는 곳 `OnTurn`(696행) 711행 |
| 판 준비 "짝!"(`IDW_CARDSETUP`)과 섞기 시작 `OnInit` | `PlayerHuman.cpp` 313~339행 |
| 키티 받기 `OnDeal`(nMode 10) | `PlayerHuman.cpp` 377~378행 |
| 판 시작 `OnBegin` | `PlayerHuman.cpp` 418~436행 |
| 6마 죽이기 `OnKillOneFromSix` | `PlayerHuman.cpp` 458~495행 |
| 딜미스 `OnElecting` | `PlayerHuman.cpp` 507~538행 |
| 당선 `OnElected(int, CEvent*)` | `PlayerHuman.cpp` 540~576행 |
| 버릴 카드 확정 `OnElected(CGoal*, ...)` | `PlayerHuman.cpp` 607~608행 |
| 선거 끝 공지 `OnElectionEnd` | `PlayerHuman.cpp` 633~636행 |
| 야당 득점 `OnTurnEnding` | `PlayerHuman.cpp` 721~776행 |
| 프렌드 공개(소리 없음) `OnFriendIsRevealed` | `PlayerHuman.cpp` 787~806행 |
| 공약·포기·딜미스 말풍선 `CBoard::FloatGoalDSB` | [`Board_DSB.cpp`](https://github.com/skyser2003/mighty40/blob/master/Board_DSB.cpp) 239~298행 |
| 섞기 소리 | [`Board_Draw.cpp`](https://github.com/skyser2003/mighty40/blob/master/Board_Draw.cpp) 767~769행, `Board_SE.cpp` `CBoard::SuffleCards` |
| 승리·패배 `DReport` | [`DReport.cpp`](https://github.com/skyser2003/mighty40/blob/master/DReport.cpp) 64~65행 |
| 버튼 클릭 삑 `DSB::OnClickSound`, `DSB::DispatchHotspot` | [`DSB.h`](https://github.com/skyser2003/mighty40/blob/master/DSB.h) 141행, [`DSB.cpp`](https://github.com/skyser2003/mighty40/blob/master/DSB.cpp) 202행, 226행 |
| 공약·프렌드·죽이기 창 고르기 소리, 버릴 카드 토글 | [`DElection.cpp`](https://github.com/skyser2003/mighty40/blob/master/DElection.cpp) 377~397행, 513행, 750~756행, 1393~1423행 |
| 시작 화면 철컥 `DStartUp::OnClickSound` | [`DStartUp.cpp`](https://github.com/skyser2003/mighty40/blob/master/DStartUp.cpp) 189~192행 |
| 빈 곳 클릭 `MessageBeep` | [`Board_UI.cpp`](https://github.com/skyser2003/mighty40/blob/master/Board_UI.cpp) 92~93행 |
| 소리 옵션 `bUseSound` | `Option.cpp` 31행, `POptionGeneral.cpp` |
| "찍기 소리 수정" 기록 | `ReadMe.txt` 230행 |

파일이 같은지 확인한 방법: 원작 저장소의 `git ls-files -s res`와 이 저장소의 `git ls-files -s legacy/src/components/Sound/resources`의 blob 해시를 맞춰 보니 18개 모두 같았다.
