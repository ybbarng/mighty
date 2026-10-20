# 마이티 정적 사이트. 저장소 루트를 빌드 맥락으로 쓴다:
#   docker build -f deploy/Dockerfile -t mighty-web .

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

# 의존성 설치를 소스 변경과 분리해 캐시를 오래 쓴다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/ai/package.json packages/ai/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
# 공유 미리보기 이미지 주소와 직접 운영하는 Nostr 릴레이. 정적 빌드라 빌드할 때 들어간다.
ARG NEXT_PUBLIC_SITE_URL=https://mighty.byb.kr
ARG NEXT_PUBLIC_RELAY_URLS=wss://mighty.byb.kr/relay
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_RELAY_URLS=$NEXT_PUBLIC_RELAY_URLS \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mighty/web build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html
