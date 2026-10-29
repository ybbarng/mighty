# 하늘의 별 따기 회차 서버 이미지(초안). 빌드 문맥은 저장소 맨 위:
#   docker build -f apps/stardraw-server/Dockerfile -t ghcr.io/ybbarng/stardraw-server .
# 서버를 한 파일(dist/server.mjs)로 묶어 Node만 있는 작은 이미지로 돌린다. SQLite는 Node 내장(node:sqlite)이라
# 네이티브 의존 패키지가 없다. 배포 초안은 deploy/stardraw/.

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
# lefthook 같은 개발용 설치 스크립트는 돌리지 않는다. 서버와 그 의존 패키지만 받는다
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @mighty/stardraw-server...
RUN pnpm --filter @mighty/stardraw-server build

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=build /app/apps/stardraw-server/dist/server.mjs ./server.mjs
# 데이터(SQLite·장부 파일)는 /data 볼륨, 서명 열쇠는 비밀값 파일로 마운트한다
ENV PORT=8080 \
    STARDRAW_DATA_DIR=/data \
    STARDRAW_SERVER_KEY_FILE=/run/secrets/stardraw-server-key \
    STARDRAW_TRUST_PROXY=1 \
    NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
