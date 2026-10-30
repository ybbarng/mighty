# 앵커 저장소 README 초안(ybbarng/stardraw-ledger)

> 이 파일은 초안이다. 서버는 README를 쓰지 않는다. 사용자가 확인한 뒤 앵커 저장소 main 브랜치에 손으로 올린다(docs/36 11-16).
> 아래 줄부터가 README 본문이다.

---

# 하늘의 별 따기 공개 장부

[하늘의 별 따기](https://game.byb.kr/stardraw)(정시 로또)의 회차 기록을 바깥에 남기는 저장소입니다. 회차 서버가 회차를 닫을 때마다 커밋 하나를 남깁니다. 사람이 손으로 고치지 않습니다.

규칙과 설계는 [게임 센터 저장소 docs/36](https://github.com/ybbarng/mighty/blob/main/docs/36-hourly-lotto-design.md)에 있습니다.

## 브랜치

| 브랜치 | 들어 있는 것 |
|---|---|
| `main` | `genesis.txt`(장부의 처음 일정표), 정식 단계 회차. 정식 단계가 시작되면 지난 시험 회차의 장부 사본까지 모두 |
| `trial` | 시험 단계 회차 |

## 파일

```
genesis.txt                                  처음 일정표 해시(main에 한 번, 장부를 다시 시작하지 않는다는 표시)
ledgers/<장부 id>/000001.txt                 회차 앵커: 회차 기록 해시와 봉인 시각 증거 요약
ledgers/<장부 id>/ledger/genesis.json        ┐
ledgers/<장부 id>/ledger/head.json           │ 장부 사본: 회차 서버가 공개하는 장부 파일
ledgers/<장부 id>/ledger/rounds/000001.json  │ (https://game.byb.kr/stardraw-api/ledger/…)과
ledgers/<장부 id>/ledger/seals/000001.json   │ 같은 바이트
ledgers/<장부 id>/ledger/bundles/10/000001.json  │ 다 찬 10·100회차 묶음
ledgers/<장부 id>/ledger/bundles/100/000001.json ┘
```

- 장부 id는 처음 일정표 해시 앞 16자리입니다(`genesis.txt`의 `ledger` 줄).
- 회차 앵커와 그 회차의 장부 사본은 같은 커밋에 들어갑니다. 커밋 메시지: `하늘의 별 따기 {회차}회 기록 {기록 해시 앞 12자리} (장부 {id})`.
- `head.json`은 그 브랜치에 올라간 마지막 회차를 가리킵니다. 회차는 닫힌 뒤에 올라오므로 서버보다 한두 회차 늦을 수 있습니다.
- 사본을 올리기 전에 닫힌 회차는 `하늘의 별 따기 장부 파일 1~36회 (장부 {id})` 같은 커밋으로 채웠습니다.

## 서버 없이 검사하기

[게임 센터 저장소](https://github.com/ybbarng/mighty)를 받아 터미널 검사기를 돌립니다.

```sh
pnpm install
pnpm stardraw-verify                          # 이 저장소의 장부 사본을 받아 처음부터 검사
pnpm stardraw-verify --source ../stardraw-ledger   # git clone 받은 폴더에서(trial 사본은 git clone -b trial)
pnpm stardraw-verify --compare                # 회차 서버와 이 저장소 사본이 같은지 대조
```

검사기는 회차 기록 사슬, 응모권 서명과 작업 증명, drand 서명, 당첨 번호, 봉인 시각 인증 토큰(DigiCert·Sectigo), 이 저장소의 앵커를 모두 다시 계산합니다. 규칙 문서(docs/36 4절)대로 직접 검사기를 짜도 됩니다.

## 이 저장소를 믿는 범위

운영자는 이 저장소를 강제 push로 고칠 수 있습니다. 그래서 이 저장소는 보조 수단입니다.

- 봉인이 추첨(drand)보다 먼저였다는 증거는 공개 시각 인증 기관의 서명 토큰이 맡습니다.
- 사람마다 다른 장부를 보여 주거나 지난 회차를 고치면, 이 저장소의 앵커·사본, 회차 서버의 파일, 누군가 받아 둔 사본이 서로 어긋나 드러납니다. 받아 두는(clone·fork) 사람이 많을수록 고치기 어렵습니다.
