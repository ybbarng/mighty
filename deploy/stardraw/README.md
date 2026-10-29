# 하늘의 별 따기 서버 배포 초안

아직 배포하지 않았다. 아래는 servers 저장소(`byb.kr/apps/stardraw/`)로 옮길 초안과 사용자가 정할 것이다(docs/36 11-5 4번).

## 모양

- 주소: `https://game.byb.kr/stardraw-api/` (Traefik `PathPrefix`). API는 `/stardraw-api/api/...`, 공개 장부 파일은 `/stardraw-api/ledger/...`.
- 화면은 같은 출처 상대 주소로 부른다. 화면 빌드에 `NEXT_PUBLIC_STARDRAW_API=/stardraw-api`를 넣어야 서버를 쓰고, 비우면 지금처럼 기기 안 연습 장부로 돈다.
- 서비스 워커는 `/stardraw-api/` 아래를 저장하지 않는다(`apps/web/public/sw.js`).
- 이미지: `apps/stardraw-server/Dockerfile`(빌드 문맥은 저장소 맨 위). 이미지를 만드는 GitHub Actions 단계는 아직 없다. `image.yml`에 이 이미지를 더할지 정해야 한다.

## 서명 열쇠

영수증과 투명성 로그 항목에 서명하는 서버 열쇠(ECDSA P-256)다. 공개 열쇠는 `head.json`에 실려 누구나 영수증을 확인한다.

```sh
# 서버에서 한 번(파일은 저장소에 올리지 않는다)
cd ~/servers/byb.kr/apps/stardraw
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -outform DER | base64 > server-key.pkcs8
chmod 600 server-key.pkcs8
```

열쇠를 잃으면 이전 영수증은 그대로 확인되지만(공개 열쇠가 장부에 있다), 새 열쇠로 바꾼 사실을 공지해야 한다. 백업은 비밀번호 관리 앱에 둔다.

## .env

```sh
STARDRAW_EPOCH=1793530800        # 1회차 시작(유닉스 초, 정시). 처음 정하면 장부에 묶여 바꿀 수 없다
# 투명성 로그(봉인 시각 증명). 없으면 서버 시계를 적는다(시각 증명 없음)
STARDRAW_REKOR_URL=https://rekor.sigstore.dev
# GitHub 앵커(회차 기록 해시를 한 줄 파일로 커밋). 없으면 남기지 않는다
STARDRAW_ANCHOR_REPO=ybbarng/stardraw-ledger
STARDRAW_ANCHOR_BRANCH=main
STARDRAW_ANCHOR_TOKEN=...        # 그 저장소 contents 쓰기만 되는 fine-grained 토큰
```

## 백업

- 공개 장부 파일(`data/ledger/`)은 누구나 내려받고 앵커에도 해시가 남는다. 그래도 마감 전 응모권, 열쇠 등록, 당첨자 확인 전달은 SQLite에만 있다.
- 서버를 멈추지 않고 뜨기(Node 내장 SQLite backup):

```sh
docker compose exec -T stardraw node server.mjs backup /data/backup/stardraw-$(date +%F-%H%M).sqlite
```

- 정시 직후(마감·봉인)는 피해서 하루 한 번이면 된다. `data/backup/`을 서버 밖으로 옮기는 것은 다른 앱의 백업과 같은 방식으로.
- 되살리기: 컨테이너를 멈추고 `data/stardraw.sqlite`를 백업본으로 바꾼 뒤 띄운다. 장부 파일이 DB보다 앞서 있으면(백업 뒤 닫힌 회차) 그 회차들은 DB에 다시 넣어야 하니, 백업은 회차 기록이 닫힌 직후가 좋다.

## 사용자가 정할 것

1. 1회차 시작 시각(`STARDRAW_EPOCH`)
2. 투명성 로그: Sigstore Rekor 공용 로그를 쓸지(시간마다 항목 하나, 공개된다)
3. 앵커 저장소 이름과 토큰(예: `ybbarng/stardraw-ledger`, 공개)
4. 서명 열쇠 보관(서버의 파일 + 비밀번호 관리 앱 백업)
5. 이미지 빌드를 `image.yml`에 더할지, 배포를 신호 서버처럼 손으로 할지
