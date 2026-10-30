# 하늘의 별 따기 서버 배포 초안

아직 배포하지 않았다. 아래는 servers 저장소(`byb.kr/apps/stardraw/`)로 옮길 초안과 사용자가 정할 것이다(docs/36 11-5 4번, 11-6).
순서는 **시험 운영 → 잘 되면 시험 장부를 버리고 정식 시작**이다.

## 모양

- 주소: `https://game.byb.kr/stardraw-api/` (Traefik `PathPrefix`). API는 `/stardraw-api/api/...`, 공개 장부 파일은 `/stardraw-api/ledger/...`.
- 화면은 같은 출처 상대 주소로 부른다. 화면 빌드에 `NEXT_PUBLIC_STARDRAW_API=/stardraw-api`를 넣어야 서버를 쓰고, 비우면 지금처럼 기기 안 연습 장부로 돈다(아직 넣지 않았다).
- 서비스 워커는 `/stardraw-api/` 아래를 저장하지 않는다(`apps/web/public/sw.js`).
- 이미지: `ghcr.io/ybbarng/stardraw-server`(`apps/stardraw-server/Dockerfile`, 빌드 문맥은 저장소 맨 위). `.github/workflows/image.yml`의 `server-image` 일이 만든다. 저장소 변수 `STARDRAW_SERVER_IMAGE`를 `true`로 켜기 전에는 돌지 않고, 배포는 하지 않는다(이 폴더의 compose로 손으로 띄운다).
- 모드: `STARDRAW_MODE=trial|live`. 서버는 데이터 폴더의 장부 종류(처음 일정표의 시험 표시)와 모드가 다르면 뜨지 않는다.

## 서명 열쇠

영수증과 투명성 로그 항목에 서명하는 서버 열쇠(ECDSA P-256)다. 공개 열쇠는 `head.json`에 실려 누구나 영수증을 확인한다. 시험과 정식은 같은 열쇠를 써도 된다(장부가 갈려 영수증이 섞이지 않는다).

```sh
# 서버에서 한 번(파일은 저장소에 올리지 않는다)
cd ~/servers/byb.kr/apps/stardraw
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -outform DER | base64 > server-key.pkcs8
chmod 600 server-key.pkcs8
```

열쇠를 잃으면 이전 영수증은 그대로 확인되지만(공개 열쇠가 장부에 있다), 새 열쇠로 바꾼 사실을 공지해야 한다. 백업은 비밀번호 관리 앱에 둔다.

## 1. 시험 운영

시험 장부는 처음 일정표에 시험 표시가 있어 genesis 해시(꼬리표 `stardraw/genesis-trial/v1`)가 정식과 다르다. 그래서 시험 응모권·등록·증명은 정식 장부에 섞일 수 없다. 봉인 시각 인증은 정식과 같게 받고, GitHub 앵커는 `trial` 브랜치에 남긴다(아래 "시각 인증과 앵커"). 화면 위에는 "시험 운영 중 · 응모 기록은 정식 시작 때 지워집니다" 띠가 뜬다(서버가 알려 주는 모드로).

```sh
# .env
STARDRAW_MODE=trial
STARDRAW_DATA=data-trial
STARDRAW_ROUND_SECONDS=600       # 시험 회차 길이(기본 10분, 10분보다 짧을 수 없다)
# STARDRAW_EPOCH=                 # 비우면 띄운 뒤 첫 맞춘 마감(10분 회차면 다음 x:05·x:15…)이 1회차 마감
```

```sh
docker compose up -d
curl -s https://game.byb.kr/stardraw-api/api/state   # "mode":"trial"
```

시험 중 확인할 것: 응모(패스키 만들기), 마감·봉인, drand 추첨, 결과 봉투, 내 응모, 다른 기기에서 내 응모권 찾기, 당첨자 확인(별 세 개), 장부 검사, 백업.

## 2. 정식 시작

시험이 잘 되면 시험 장부를 버리고 정식 장부를 새로 만든다. **시험 장부의 패스키 등록(공개 열쇠·패스키 번호)만 옮기고**, 응모권·회차·확인 요청은 버린다. 옮긴 사람은 정식 1회차부터 다시 등록 계산 없이 응모할 수 있다(패스키는 기기에 그대로 있다). 원시 열쇠(터미널) 등록은 옮기지 않는다.

```sh
cd ~/servers/byb.kr/apps/stardraw
# 1) 시험 장부를 마지막으로 떠 두고 시험 서버를 내린다
docker compose exec -T stardraw node server.mjs backup /data/backup/trial-final.sqlite
docker compose down

# 2) 정식 장부를 만든다(빈 data-live 폴더에, 정식 1회차 시작 시각은 지금보다 뒤)
#    매시 정각 추첨 · 55분 마감: 1회차 시작은 x:55여야 한다(아니면 거절).
#    예: 08:55 시작 → 1회차 마감 09:55, 추첨 10:00
mkdir -p data-live && cp data-trial/backup/trial-final.sqlite data-live/
STARDRAW_DATA=data-live docker compose run --rm -e STARDRAW_MODE=live stardraw \
  node server.mjs start-live --epoch 2026-11-02T08:55:00+09:00 \
  --carry-registrations /data/trial-final.sqlite
#   → "정식 장부를 만들었다: 1회차 …, 패스키 등록 N개를 옮김, genesis …"

# 3) .env를 정식으로 바꿔 띄운다
#    STARDRAW_MODE=live
#    STARDRAW_DATA=data-live
#    (시각 인증·앵커는 compose 기본값 그대로. 앵커 브랜치는 정식이면 main)
docker compose up -d
curl -s https://game.byb.kr/stardraw-api/api/state   # "mode":"live"
curl -s https://game.byb.kr/stardraw-api/ledger/genesis.json   # carried: 옮긴 등록 목록
```

- `start-live`는 이미 장부가 있는 폴더, 시험 장부가 아닌 백업, 지난 시각을 거절한다.
- 정식 회차 길이는 1시간이다(`--round-seconds`로 바꿀 수 있다).
- 화면은 장부를 처음부터 다시 받는다. 시험 때 기기에 남은 내 응모권 목록은 정식 장부에 없는 회차라 결과가 나오지 않는다(화면에서 정리할지는 따로 정한다).
- `data-trial/`은 지워도 되지만, 정식이 자리 잡을 때까지 서버 밖에 하나 보관해 둔다.

## 시각 인증과 앵커

- **봉인 시각 인증**(docs/36 11-7): 마감 직후 봉인 값의 시각 인증 토큰을 공개 기관에서 받는다. 기본 `STARDRAW_TSA=digicert,sectigo`, `STARDRAW_TSA_MIN=1`(한 곳 이상). 서버가 바깥(80·443)으로 나갈 수 있어야 한다. 시작 기록에 `시각 인증: digicert, sectigo 중 1곳 이상`이 찍힌다. 마감 3분 뒤까지 한 곳도 못 받으면 그 회차는 무효다. 개발용으로 끄려면 `STARDRAW_TSA=off`(서버 시계를 적는다, 시각 증명 없음).
- **GitHub 앵커**: 회차마다 `ybbarng/stardraw-ledger`에 `ledgers/<장부 id>/<회차>.txt`를 커밋한다. 브랜치는 시험 `trial`, 정식 `main`(`STARDRAW_ANCHOR_BRANCH`로 바꿀 수 있다). 시작 기록에 `앵커: ybbarng/stardraw-ledger(trial 브랜치)`가 찍힌다.
- 앵커 토큰은 저장소 밖 파일에만 둔다. 이 저장소 Contents 읽기·쓰기만 되는 fine-grained 토큰:

```sh
# 서버에서 한 번(값은 어디에도 붙여 넣거나 찍지 않는다)
install -m 600 /dev/null /home/ybbarng/secrets/stardraw-anchor.env
${EDITOR:-vi} /home/ybbarng/secrets/stardraw-anchor.env   # STARDRAW_ANCHOR_TOKEN=github_pat_...
```

- compose의 `env_file`이 이 파일을 `required: false`로 읽는다. 파일이 없으면 앵커만 꺼지고(`앵커 저장소 설정이 없어 …`) 서버는 뜬다. 앵커가 실패하면 1분 뒤 그 회차부터 다시 보내고, 회차 진행은 멈추지 않는다.
- Rekor는 꺼 둔 선택지다(`STARDRAW_TSA=off` + `STARDRAW_REKOR_URL`일 때만).

## 백업

- 공개 장부 파일(`data-*/ledger/`)은 누구나 내려받고 정식은 앵커에도 해시가 남는다. 그래도 마감 전 응모권, 열쇠 등록, 당첨자 확인 전달은 SQLite에만 있다.
- 서버를 멈추지 않고 뜨기(Node 내장 SQLite backup):

```sh
docker compose exec -T stardraw node server.mjs backup /data/backup/stardraw-$(date +%F-%H%M).sqlite
```

- x:55~x:01(마감·봉인·추첨)은 피해서 하루 한 번이면 된다. `backup/`을 서버 밖으로 옮기는 것은 다른 앱의 백업과 같은 방식으로.
- 되살리기: 컨테이너를 멈추고 `stardraw.sqlite`를 백업본으로 바꾼 뒤 띄운다. 장부 파일이 DB보다 앞서 있으면(백업 뒤 닫힌 회차) 그 회차들은 DB에 다시 넣어야 하니, 백업은 회차 기록이 닫힌 직후가 좋다.

## 사용자가 정할 것

1. 시험 운영을 언제 시작할지, 시험 회차 길이(기본 10분)
2. 정식 1회차 시작 시각(`start-live --epoch`, x:55). 처음 정하면 장부에 묶여 바꿀 수 없다
3. 봉인 시각 인증: 공개 기관 DigiCert·Sectigo, 한 곳 이상으로 정함(2026-10-30). 더 엄격히 하려면 `STARDRAW_TSA_MIN=2`
4. 앵커 저장소: `ybbarng/stardraw-ledger`(공개)로 정함. 토큰은 `/home/ybbarng/secrets/stardraw-anchor.env`
5. 서명 열쇠 보관(서버의 파일 + 비밀번호 관리 앱 백업)
6. 저장소 변수 `STARDRAW_SERVER_IMAGE=true`로 이미지 빌드를 켤 때, 화면 빌드에 `NEXT_PUBLIC_STARDRAW_API`를 넣을 때
