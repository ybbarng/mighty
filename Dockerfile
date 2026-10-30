# mighty 이미지 — GitHub Actions 가 빌드해 GHCR(ghcr.io/ybbarng/mighty)에 올린다. 서버에서는 빌드하지 않는다.
#
# 서버 없는 정적 사이트다(Next `output: "export"`). Node 런타임 없이 nginx 가 파일만 낸다.
# 그래서 standalone·node-linker=hoisted 는 필요 없고, DB 가 없으니 도구 이미지·배포 전 단계도 없다.
# 온라인 대전에서 서로를 찾는 신호 서버는 servers 저장소 byb.kr/apps/mighty-signal 이 따로 띄운다.

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# package.json 의 packageManager(pnpm 버전 고정)를 corepack 이 따른다
RUN corepack enable
WORKDIR /app

# 의존성 — lockfile 과 각 패키지의 package.json 이 바뀔 때만 다시 받는다
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/stardraw-server/package.json apps/stardraw-server/
COPY packages/engine/package.json packages/engine/
COPY packages/ai/package.json packages/ai/
COPY packages/hearts-engine/package.json packages/hearts-engine/
COPY packages/hearts-ai/package.json packages/hearts-ai/
COPY packages/fair-play/package.json packages/fair-play/
COPY packages/omok-engine/package.json packages/omok-engine/
COPY packages/omok-ai/package.json packages/omok-ai/
COPY packages/janggi-engine/package.json packages/janggi-engine/
COPY packages/janggi-ai/package.json packages/janggi-ai/
COPY packages/hwatu/package.json packages/hwatu/
COPY packages/chess-engine/package.json packages/chess-engine/
COPY packages/chess-ai/package.json packages/chess-ai/
COPY packages/baduk-engine/package.json packages/baduk-engine/
COPY packages/baduk-ai/package.json packages/baduk-ai/
COPY packages/nyrongppong-engine/package.json packages/nyrongppong-engine/
COPY packages/nyrongppong-ai/package.json packages/nyrongppong-ai/
COPY packages/gostop-engine/package.json packages/gostop-engine/
COPY packages/gostop-ai/package.json packages/gostop-ai/
COPY packages/minhwatu-engine/package.json packages/minhwatu-engine/
COPY packages/minhwatu-ai/package.json packages/minhwatu-ai/
COPY packages/baseball-engine/package.json packages/baseball-engine/
COPY packages/baseball-ai/package.json packages/baseball-ai/
COPY packages/yut-engine/package.json packages/yut-engine/
COPY packages/yut-ai/package.json packages/yut-ai/
COPY packages/stardraw-core/package.json packages/stardraw-core/
# lefthook 같은 개발용 설치 스크립트는 돌리지 않는다
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
# 정적 빌드라 주소들은 빌드할 때 들어간다.
#   NEXT_PUBLIC_SITE_URL   공유 미리보기 이미지 주소
#   NEXT_PUBLIC_UMAMI_WEBSITE_ID  사이트 통계(stats.byb.kr umami) ID. 비우면 통계 스크립트를 싣지 않는다(docs/33)
#   NEXT_PUBLIC_STARDRAW_API  하늘의 별 따기 서버 주소(예: /stardraw-api). 비우면 기기 안 연습 장부로 돈다(docs/36 11-5)
ARG NEXT_PUBLIC_SITE_URL=https://game.byb.kr
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=
ARG NEXT_PUBLIC_STARDRAW_API=
# 빌드한 커밋(.git 은 빌드 문맥에 없다). 빌드 id와 화면 코드 해시 목록 build-hashes.json 에 들어간다(docs/36 11-8 재현 빌드)
ARG SOURCE_COMMIT=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_PUBLIC_STARDRAW_API=$NEXT_PUBLIC_STARDRAW_API \
    SOURCE_COMMIT=$SOURCE_COMMIT \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mighty/web build

# 화면 코드 해시 목록만 꺼내는 단계(Image 워크플로가 --output 으로 받아 기록에 남긴다)
FROM scratch AS hashes
COPY --from=build /app/apps/web/out/build-hashes.json /

# 실행 — 서버의 static 앱과 같은 nginx 판. 서버 compose 에서 read_only + tmpfs 로 띄운다
FROM nginx:1.31.8-alpine AS runner
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html
EXPOSE 80
