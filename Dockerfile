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
COPY packages/engine/package.json packages/engine/
COPY packages/ai/package.json packages/ai/
COPY packages/hearts-engine/package.json packages/hearts-engine/
COPY packages/hearts-ai/package.json packages/hearts-ai/
COPY packages/fair-play/package.json packages/fair-play/
# lefthook 같은 개발용 설치 스크립트는 돌리지 않는다
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
# 정적 빌드라 주소들은 빌드할 때 들어간다.
#   NEXT_PUBLIC_SITE_URL   공유 미리보기 이미지 주소
ARG NEXT_PUBLIC_SITE_URL=https://mighty.byb.kr
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mighty/web build

# 실행 — 서버의 static 앱과 같은 nginx 판. 서버 compose 에서 read_only + tmpfs 로 띄운다
FROM nginx:1.31.8-alpine AS runner
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html
EXPOSE 80
