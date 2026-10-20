# 배포 (mighty.byb.kr)

개인 서버의 Traefik 뒤에 컨테이너 세 개를 붙인다(TURN은 Traefik을 거치지 않는다).

| 컨테이너 | 하는 일 | 주소 |
|---|---|---|
| `web` | 정적 사이트(nginx) | `https://mighty.byb.kr` |
| `relay` | 온라인 대전 시그널링용 Nostr 릴레이(nostr-rs-relay) | `wss://mighty.byb.kr/relay` |
| `turn` | 직접 연결이 막힌 네트워크용 TURN 중계(coturn). Traefik을 거치지 않는다 | `turn:mighty.byb.kr:3478` |

게임 진행은 기기끼리 WebRTC로 바로 주고받는다. 릴레이는 서로를 찾을 때 몇 KB만 거친다.
앱은 이 릴레이를 먼저 쓰고, 공개 릴레이 두 곳을 예비로 함께 쓴다(`apps/web/src/net/p2p-transport.ts`).

## 처음 올릴 때

1. 서버의 Traefik 설정에 맞춰 `deploy/.env`를 만든다. 기본값과 같으면 만들지 않아도 된다.

   ```sh
   MIGHTY_HOST=mighty.byb.kr
   TRAEFIK_NETWORK=traefik          # Traefik 컨테이너가 붙은 외부 네트워크
   TRAEFIK_ENTRYPOINT=websecure     # 443 진입점 이름
   TRAEFIK_CERT_RESOLVER=letsencrypt
   TURN_USERNAME=mighty
   TURN_PASSWORD=길고-무작위인-값      # 웹 번들에 들어가므로 다른 곳에 쓰는 비밀번호는 쓰지 않는다
   TURN_EXTERNAL_IP=서버의-공인-IP
   ```

   방화벽에서 3478(UDP·TCP)과 49160–49200(UDP)을 연다.

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
- TURN: 한 기기를 휴대폰 데이터, 다른 기기를 회사 와이파이처럼 서로 다른 망에 두고 방에 들어간다. 또는 [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)에 `turn:mighty.byb.kr:3478`과 계정을 넣어 `relay` 후보가 나오는지 본다.

## 아직 안 한 것

- 실제 서버에서 이미지를 빌드해 본 적이 없다(작성할 때 로컬 Docker 데몬이 꺼져 있었다).
- TURN 계정은 정적 사이트라 웹 번들에 들어간다. 누구나 빼내 쓸 수 있으므로 `turnserver.conf`에서 동시 중계 수와 대역폭을 낮게 제한했다. 남용이 보이면 시간 제한 계정을 발급하는 작은 서버(coturn REST API 방식)로 바꾼다.
- TLS(`turns:` 443)는 아직 없다. 443만 열린 아주 엄격한 망에서는 연결되지 않을 수 있다.
