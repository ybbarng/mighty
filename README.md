# Mighty: The Great Card Game

대학가 카드게임 마이티를 웹에서 되살리는 프로젝트. 윈도우용 마이티 네트워크(Mighty Network) 4.0을 이어받아 규칙 옵션과 진행 방식을 따르고, 빈자리는 컴퓨터 플레이어가 채운다.

## 문서

- [01. 현재 상태 점검](docs/01-current-state.md) — 2019년 코드 정리와 버그 목록
- [02. 조사 자료](docs/02-research.md) — 원작 규칙 판정, 옵션 59개, 규칙 문자열 형식, 라이브러리 현황
- [03. 되살리기 계획](docs/03-plan.md) — 구조, 기술 스택, 단계
- [04. 원작 게임 진행 명세](docs/04-original-game-flow.md)
- [05. 화면 배치](docs/05-layout.md) — 원작 배치 분석, 가로·세로 배치안, 좌표 계산 규칙
- [06. 남은 일](docs/06-backlog.md) — 할 일 목록과 정해야 할 것
- [07. 공정성과 보안](docs/07-security.md) — 엿보기·섞기 조작·규칙 위반·결과 조작을 막는 단계별 설계
- [08. 학교 규칙(관악컴반) 자료](docs/08-school-rules.md) — 선배 글, 기억한 규칙 문자열, 2019년 코드, 나무위키, 3.2 딜미스 버그 분석, 남은 질문
- [09. 컴퓨터 플레이어와 마이티 전략](docs/09-ai-strategy.md) — 전술 문서의 요점과 지금 봇 비교, 실력 단계 나누기
- [10. 컴퓨터 실력 단계 기획 (초안)](docs/10-ai-levels-plan.md) — 입문/보통/고수의 행동 정의, 세기 재기, 진행 순서, 열린 질문

## 구조

```
packages/engine  @mighty/engine — 규칙 엔진 (순수 함수, 외부 의존성 없음)
packages/ai      @mighty/ai     — 컴퓨터 플레이어
apps/web         @mighty/web    — Next.js 정적 웹앱
legacy/          2019년 create-react-app + boardgame.io 코드 (참고용)
```

## 개발

Node 24, pnpm (버전은 `package.json`의 `packageManager`).

```sh
pnpm install
pnpm dev        # 웹앱 개발 서버
pnpm check      # lint + typecheck + test
pnpm build      # 정적 빌드 (apps/web/out)
```

커밋 전에는 biome, push 전에는 lint·typecheck·test가 lefthook으로 돈다.

## Thanks to

- [Mighty Network](https://github.com/skyser2003/mighty40) — 규칙과 진행 방식의 기준. 이 게임은 마이티 네트워크 4.0을 이어받아 만들었다.
  - 1999 장문성
  - 2006–2011 UPnL
  - 2006 puzzlet
  - 2011 Yoshi-TS4
  - 2026 ybbarng (웹으로 다시 만듦)
- 전통 그림 카드(J·Q·K) 인물: [Dmitry Fomin, English pattern playing cards](https://commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck.svg), 위키미디어 공용, CC0. `apps/web/public/cards/traditional/`

