# mighty 이미지 — GitHub Actions 가 빌드해 GHCR(ghcr.io/ybbarng/mighty)에 올린다. 서버에서는 빌드하지 않는다.
#
# 서버 없는 정적 사이트다(Next `output: "export"`). Node 런타임 없이 nginx 가 파일만 낸다.
# 그래서 standalone·node-linker=hoisted 는 필요 없고, DB 가 없으니 도구 이미지·배포 전 단계도 없다.
# 온라인 대전의 연결 중개(Nostr 릴레이)는 공개 이미지를 서버 compose 가 따로 띄운다.

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
# lefthook 같은 개발용 설치 스크립트는 돌리지 않는다
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
# 정적 빌드라 주소들은 빌드할 때 들어간다.
#   NEXT_PUBLIC_SITE_URL   공유 미리보기 이미지 주소
#   NEXT_PUBLIC_RELAY_URLS 직접 운영하는 Nostr 릴레이(쉼표로 여럿). 비우면 공개 릴레이만 쓴다
ARG NEXT_PUBLIC_SITE_URL=https://mighty.byb.kr
ARG NEXT_PUBLIC_RELAY_URLS=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_RELAY_URLS=$NEXT_PUBLIC_RELAY_URLS \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mighty/web build

# 실행 — 서버의 static 앱과 같은 nginx 판. 서버 compose 에서 read_only + tmpfs 로 띄운다
FROM nginx:1.31.7-alpine AS runner
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html
EXPOSE 80
