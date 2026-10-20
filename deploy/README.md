# 배포 (mighty.byb.kr)

개인 서버의 Traefik 뒤에 컨테이너 두 개를 붙인다.

| 컨테이너 | 하는 일 | 주소 |
|---|---|---|
| `web` | 정적 사이트(nginx) | `https://mighty.byb.kr` |
| `relay` | 온라인 대전 시그널링용 Nostr 릴레이(nostr-rs-relay) | `wss://mighty.byb.kr/relay` |

게임 진행은 기기끼리 WebRTC로 바로 주고받는다. 릴레이는 서로를 찾을 때 몇 KB만 거친다.
앱은 이 릴레이를 먼저 쓰고, 공개 릴레이 두 곳을 예비로 함께 쓴다(`apps/web/src/net/p2p-transport.ts`).

## 처음 올릴 때

1. 서버의 Traefik 설정에 맞춰 `deploy/.env`를 만든다. 기본값과 같으면 만들지 않아도 된다.

   ```sh
   MIGHTY_HOST=mighty.byb.kr
   TRAEFIK_NETWORK=traefik          # Traefik 컨테이너가 붙은 외부 네트워크
   TRAEFIK_ENTRYPOINT=websecure     # 443 진입점 이름
   TRAEFIK_CERT_RESOLVER=letsencrypt
   ```

2. `deploy/compose.yaml`의 릴레이 이미지 태그를 그때 확인한 버전으로 고정한다.
3. 올린다.

   ```sh
   docker compose -f deploy/compose.yaml up -d --build
   ```

## 확인

- `https://mighty.byb.kr` 첫 화면, `/cards` 카드 모음이 열린다.
- 홈 화면에 추가했을 때 아이콘과 이름이 나온다(`manifest.webmanifest`).
- 휴대폰 두 대(다른 네트워크)로 방을 만들고 들어가 한 판을 끝까지 둔다. 끝에 "공정성 확인" 문구가 나온다.
- 릴레이: 브라우저 개발자 도구의 네트워크 탭에서 `wss://mighty.byb.kr/relay` 연결이 열려 있다.

## 아직 안 한 것

- 실제 서버에서 이미지를 빌드해 본 적이 없다(작성할 때 로컬 Docker 데몬이 꺼져 있었다).
- 회사·학교처럼 WebRTC 직접 연결이 막힌 네트워크를 위한 TURN(coturn)은 아직 없다.
