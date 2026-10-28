# 게임 센터 (game.byb.kr, 저장소 이름은 아직 mighty)

대학 시절 하던 카드 게임 마이티(원작 Mighty Network 4.0)를 웹으로 되살린 프로젝트에서 시작해, 2026-10-28부터 게임 모음으로 넓히는 중이다(docs/18, 19). 첫 화면은 게임 목록이고 오목(/omok)·장기(/janggi)·체스(/chess)·바둑(/baduk)·마이티(/mighty)·하트(/hearts)가 있다. 다음은 화투(고스톱·민화투·나이롱뽕), 그리고 정석·초반을 익히는 "수 배우기"(docs/23). 서버 없이 친구와 온라인 대전(WebRTC, 방장 기기가 엔진), 혼자 하기(컴퓨터 여러 단계), 튜토리얼이 있고, 카드 게임은 멘탈 포커로 방장도 남의 패를 모른다.

**새 세션은 먼저 [docs/00-handoff.md](docs/00-handoff.md)를 읽는다.** 지금 상태, 남은 일, 사용자가 정해야 할 것이 있다.

## 구조
- `apps/web` — Next.js 정적 빌드(`out/`). 화면, 온라인 방(`src/net/`), 내 기록(`src/stats/`), 복기(`src/review/`), 보안 설명(`/security`), 보안 배우기(`/learn`)
- `packages/engine` 마이티 엔진(순수 함수) · `packages/ai` 마이티 컴퓨터 · `packages/hearts-engine` · `packages/hearts-ai`
- `packages/fair-play` — 멘탈 포커(SRA 섞기, 열쇠 증명 `proof.ts`, 섞기 증명 `shuffle-proof.ts`, 판 끝 다시 계산 `audit.ts`)
- `docs/` — 번호순 설계 문서. 남은 일은 `06-backlog.md`
- 원작 효과음과 2019년 코드·옛 기록은 비공개 저장소 `ybbarng/mighty-archive`에 있다(효과음은 라이선스가 없어 이 공개 저장소와 배포에 넣지 않는다, docs/16)

## 명령
- 개발 서버: `pnpm dev` (포트 3456)
- 시험: `pnpm test`(단위, 약 1분 반) · `pnpm lint` · `pnpm typecheck`
- 화면 시험: `pnpm --filter @mighty/web build` 뒤 `pnpm --filter @mighty/web exec playwright test`. 여러 탭 멘탈 포커는 `FAIR_MULTI=1`
- 멘탈 포커 계산 시간: `pnpm --filter @mighty/fair-play bench`

## 작업 규칙(사용자가 정한 것)
- `main`에서 바로 작은 단위로 커밋하고 push한다. 커밋 메시지는 한국어, 끝에 Co-Authored-By 줄.
- push하면 Image 워크플로가 이미지를 만들어 서버에 배포한다. CI는 따로 돈다(약 6분. 단위 시험과 화면 시험 3조각을 동시에 돌린다).
- push 전 검사(lefthook: lint·typecheck·test)는 1분 반쯤 걸린다. 예전처럼 오래 걸려 GitHub 연결이 끊기면 시험을 직접 돌려 통과를 확인한 뒤 `--no-verify`로 올린다. 오래 걸리는 시험 파일은 나눠서 동시에 돌게 한다(한 파일 안의 시험은 차례로 돈다).
- 기능은 따로 말하지 않아도 **마이티와 하트 모두**에 넣는다. 공통 모듈(GameKit, HostRoom, GuestRoom, LocalMatch, 공통 화면 조각)에 두고, 게임마다 다른 부분은 `GameKit`의 필수 항목으로 둔다(`retireAction`, `stats`, `review` 등).
- 화면을 바꾸면 화면 시험 스크린숏으로 직접 확인한다.
- **flaky 시험은 두지 않는다(2026-10-29).** 결과가 기기 속도에 따라 달라지면 안 된다.
  - 제한 시간(대신 두기, 투표, 재연결, 섞기 증명 응답 등)은 `Clock`으로 잰다. 제품은 `realClock`, 시험은 `ManualClock`을 넣는다. "늦어서 생기는 일"은 시험이 `clock.advance`로 정확한 순간에 일으킨다.
  - 시험은 "n ms 기다리면 끝나 있겠지"나 "n번 돌면 되겠지"로 기다리지 않는다. 조건(기기 `idle()`·`busy()`, 화면 상태, 저장된 기록)이 맞을 때까지 기다리고, 시간 상한은 멈춘 시험을 잡는 안전장치로만 둔다.
  - 시험은 역할에 맞게 둔다. 군마다 다른 계산은 군 계층 시험이 두 군으로 보고, 진행 논리는 게임이 쓰는 군(r255) 하나로 본다. 같은 논리를 느린 설정으로 되풀이하지 않는다.
- 사용자에게 보이는 글은 쉬운 한국어(영어 음역·무거운 한자어 피하기).
- 새 패키지를 만들면 `Dockerfile`의 package.json COPY 줄에도 넣는다.
- **새 게임은 [docs/21-new-game-checklist.md](docs/21-new-game-checklist.md)를 처음부터 끝까지 따른다.** 기본 요건은 다섯이다: PC·휴대폰 화면, 여러 단계 컴퓨터, 효과음, 온라인 대전, 튜토리얼. 판 게임은 개인 시간도 갖춘다. 올릴 때마다 문서 끝 "게임별 상태" 표를 고치고, 새 구성요소가 생기면 목록에 더한다.
