# Mighty: The Great Card Game

대학가 카드게임 마이티를 웹에서 되살리는 프로젝트. 윈도우판 Mighty Network의 규칙 옵션과 진행 방식을 따르고, 빈자리는 컴퓨터 플레이어가 채운다.

## 문서

- [01. 현재 상태 점검](docs/01-current-state.md) — 2019년 코드 정리와 버그 목록
- [02. 조사 자료](docs/02-research.md) — 원작 규칙 판정, 옵션 59개, 규칙 문자열 형식, 라이브러리 현황
- [03. 되살리기 계획](docs/03-plan.md) — 구조, 기술 스택, 단계
- [04. 원작 게임 진행 명세](docs/04-original-game-flow.md)

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

- [Mighty Network](https://github.com/skyser2003/mighty40) by 장문성 (sw6ueyz@hitel.net), UPnL — 규칙과 진행 방식의 기준
- [deck-of-cards](https://github.com/pakastin/deck-of-cards) — 카드 이미지
