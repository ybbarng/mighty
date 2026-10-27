# 배포 (mighty.byb.kr)

byb.kr 서버의 규칙(`servers` 저장소 `byb.kr/apps/README.md`)을 따른다. 이미지는 GitHub Actions 가 빌드해 GHCR 에 올리고,
서버는 받아서 띄우기만 한다. 서버에서는 빌드하지 않는다.

## 나누는 일

| 어디 | 무엇 |
|---|---|
| **이 저장소** | `Dockerfile`(정적 빌드 → nginx), `.github/workflows/image.yml`(빌드 → `ghcr.io/ybbarng/mighty` → SSH 로 `deploy <sha>`/`test <sha>`), `deploy/nginx.conf` |
| **servers 저장소 `byb.kr/apps/mighty/`** | `compose.yaml`, `deploy.sh`(wine 의 것을 본떠 이름·헬스체크만 바꾼다) |
| **서버에만** | `~/.ssh/authorized_keys` 의 배포 키 한 줄 |

정적 사이트라 DB·배포 전 단계(`ops/release.sh`)·도구 이미지가 없다. 헬스체크 주소는 `/healthz`(늘 200).

## 이 저장소의 GitHub 설정

- 시크릿: `SERVER_HOST`(byb.kr), `SERVER_USER`(ybbarng), `SERVER_SSH_KEY`(mighty 전용 배포 키의 개인키). 시크릿이 없으면 이미지만 올리고 배포는 건너뛴다.

## servers 저장소에 둘 compose.yaml 초안

```yaml
# mighty.byb.kr — 이미지는 ybbarng/mighty 의 GitHub Actions 가 GHCR 에 올린다. 배포는 deploy.sh.
services:
  mighty:
    image: ghcr.io/ybbarng/mighty:${MIGHTY_TAG:-latest}
    restart: unless-stopped
    mem_limit: 32m
    read_only: true
    tmpfs:
      - /var/cache/nginx
      - /var/run
      - /tmp
    networks: [web]
    labels:
      - traefik.enable=${MIGHTY_TRAEFIK:-true} # 시험 판(deploy.sh test)은 false
      - traefik.http.routers.mighty-secure.rule=Host(`mighty.byb.kr`)
      - traefik.http.routers.mighty-secure.entrypoints=websecure
      - traefik.http.routers.mighty-secure.tls.certresolver=le
      - traefik.http.services.mighty.loadbalancer.server.port=80

networks:
  web:
    external: true
```

`deploy.sh` 는 wine 의 것에서 DB 백업·`tools` 단계를 빼고, 헬스체크를 이렇게 바꾼다(nginx alpine 에는 busybox wget 이 있다):

```sh
CODE=$(docker compose exec -T mighty wget -qO /dev/null -S http://127.0.0.1/healthz 2>&1 | awk '/HTTP\//{print $2; exit}' || echo 000)
```

## TURN 중계 (2026-10-27)

직접 연결이 막힌 네트워크(회사 와이파이 등)를 위한 TURN(coturn)은 servers 저장소 `byb.kr/apps/turn/` 이 맡는다.

- 주소: `turns:turn.byb.kr:443?transport=tcp` 하나. traefik 이 443 에서 넘긴다(새 포트를 열지 않는다). 그래서 두 사람 모두 이 TURN 으로 중계할 때만 이어진다.
- 계정: 앱이 방에 들어갈 때 같은 출처 `GET /turn-credentials` → `{username, credential, urls, ttl}`(요청마다 새 계정, 6시간). 계정을 번들에 넣지 않는다. 못 받으면 TURN 없이 잇는다(`apps/web/src/net/turn.ts`).
- 서비스 워커는 이 주소를 저장하지 않는다(`public/sw.js` 의 `NO_STORE`).
- 남용 막기(대역폭·동시 중계 수 제한, 내부 주소로 중계 금지)는 servers 쪽 설정에 있다.

## 신호 서버

방에서 서로를 찾는 신호(trystero의 알리기·연결 정보)는 servers 저장소 `byb.kr/apps/mighty-signal/` 이 맡는다(2026-10-27부터, 그 전에는 공개 Nostr 릴레이).

- 주소: 같은 출처 `https://mighty.byb.kr/signal/`. `GET /signal/sub?t=<주제>` 로 구독(SSE), `POST /signal/pub?t=<주제>` 로 올린다. 주제는 방 코드에서 만든 SHA-1 해시(바이트마다 36진수, 20~40자).
- 저장하지 않고 지금 구독한 사람에게만 넘긴다. 내용은 trystero가 방 코드로 암호화한 연결 정보라 서버가 읽지 못한다.
- 앱 쪽은 `apps/web/src/net/signal.ts`(trystero `createTopicStrategy`). 같은 서버를 통로 셋(`LANES`)으로 써서 연결 시도를 겹친다(한 사람이 들어갈 때 구독 6개, 올리기 수십 번). 주소는 `NEXT_PUBLIC_SIGNAL_URL`(기본 `https://mighty.byb.kr/signal`). 개발 서버(localhost:3456)도 같은 서버를 쓴다.
- 서비스 워커는 `/signal/` 아래를 건드리지 않는다(`public/sw.js` 의 `NO_STORE_PREFIX`).
- 남용 막기: Traefik 요청 횟수 제한, 본문 16KB, 연결 수(전체·IP·주제), 다른 사이트 출처 거절.

## 확인

- `https://mighty.byb.kr` 첫 화면, `/cards` 카드 모음, `/healthz` 가 열린다.
- 홈 화면에 추가했을 때 아이콘과 이름이 나온다(`manifest.webmanifest`).
- 휴대폰 두 대(다른 네트워크)로 방을 만들고 들어가 한 판을 끝까지 둔다. 끝에 "공정성 확인" 문구가 나온다.
- 방에 들어가면 브라우저 개발자 도구의 네트워크 탭에서 `/signal/sub` 구독 두 개(방 공용·내 주제)가 열려 있다.
