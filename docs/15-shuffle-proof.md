# 섞기 증명 조사 (2026-10-22)

> 1단계(cut-and-choose)를 붙였다. 실제 구현과 비용은 docs/13 11절.

멘탈 포커(docs/13)에서 아직 못 잡는 것은 **섞기 단계의 바꿔치기·복제·빼기**다. 지금은 카드가 안 열리거나 판 끝에 같은 카드가 두 번 나와야 알고, 누가 했는지 모른다. 이것을 잡는 섞기 증명(verifiable shuffle)을 조사했다. 구현 전 검토용이다.

## 결론

1. **지금 SRA 구조에 바로 맞는 것은 둘**: cut-and-choose와 Neff(2001) general k-shuffle. Neff 2001은 "출력마다 입력의 같은 비밀 거듭제곱이고 순서만 섞였다"를 증명한다. 우리 `lockAndShuffle`(c→c^e 뒤 순열)이 정확히 이 문장이다(원문 확인). Groth(2003/2010), Bayer–Groth(2012)는 ElGamal 같은 재암호화 섞기용이라 그대로는 못 쓴다.
2. **우리 군(2048비트 안전 소수)에서는 대수적 증명이 비싸다.** 영지식에 쓰는 무작위 지수가 모두 2048비트(거듭제곱 하나 약 10ms)라 Neff는 53장에 증명·확인이 각각 4~5초다.
3. **1단계 추천: 우리에게 맞춘 cut-and-choose.** 짧은 열쇠(320비트), 가중치 묶음 확인, 지금의 Chaum–Pedersen(`proof.ts`) 재사용. 16번 반복하면 증명 약 2초, 확인 약 0.5초. 섞은 덱은 바로 넘기고 증명은 뒤따라(Web Worker) 보내면 판 시작 시간은 늘지 않는다.
4. **2단계(장기): 타원곡선 ElGamal(ristretto255) + Bayer–Groth.** 표준 구성이고 증명이 작다(52장 약 5.5KB). 대신 잠그기·자리 열쇠·하트 넘기기·판 끝 확인을 모두 다시 짜야 한다.
5. **"문제가 생겼을 때만 확인"은 반만 된다.** 증명 만들기는 매 판 해야 하고 확인만 미룰 수 있다. 복제로 남의 패를 엿보는 피해는 확인 전에 일어나므로 "나눠 준 직후 뒤에서 확인하고 첫 카드를 내기 전에 끝낸다"를 권한다.

## 방식 비교

| 방식 | 무엇을 증명하나 | 원리 | 크기·계산량 | SRA에 바로? |
|---|---|---|---|---|
| cut-and-choose (Sako–Kilian 1995, Schindelhauer 1998) | 출력이 입력의 순열이고 모두 같은 변환 | 중간 덱 Z를 더 만들고, 도전 비트에 따라 X→Z 또는 Z→Y를 보인다. 한 번에 들킬 확률 ½, k번이면 속을 확률 2^-k | 회마다 n개 | 예 |
| Neff 2001 general k-shuffle | Y_i = X_π(i)^c, C = g^c | 다항식 ∏(t−x_i) = ∏(t−y_i)가 무작위 t에서 같으면 두 집합이 같다(Schwartz–Zippel). Chaum–Pedersen을 여러 변수로 넓혀(ILMPP) 보인다 | 증명 8n+5, 확인 9n+2번 거듭제곱. 속을 확률 <(n+4)/q | 예 |
| Groth 2003/2010 | 동형 암호문 재암호화+순열 | 순열 커밋 → 알려진 내용의 섞기로 줄인다 | 선형 | 아니다 |
| Bayer–Groth 2012 | 동형 암호문 섞기 | 곱 인자 + 다중 거듭제곱 인자, √n×√n 행렬 | 통신 O(√n), 52장 5,547B(ziffle) | 아니다 |
| Groth–Kohlweiss 2015 | 커밋 목록 중 하나가 0을 연다 | 비트별 로그 크기 증명 | O(log n) | 섞기 증명이 아니다. "낸 카드가 내 패 중 하나" 같은 증명에 맞다 |

## 우리에게 맞춘 cut-and-choose (제안, 검토 필요)

증명할 문장: 입력 X(53장)와 출력 Y에 대해 어떤 π, e가 있어 Y_i = X_π(i)^e. 바꿔치기·복제·빼기는 모두 이것을 깬다.

한 회:
- 증명자는 순열 σ와 짧은 t(320비트)를 골라 **Z = σ(X^t)**와 **D = g^(e/t)**를 낸다.
- 도전 0: σ, t 공개. 확인자는 64비트 가중치 w로 ∏Z_i^w_i = (∏X_σ(i)^w_i)^t를 본다.
- 도전 1: τ = π∘σ⁻¹ 공개(π와 무관한 무작위 순열). A = ∏Z_τ(i)^w_i, B = ∏Y_i^w_i로 두고 "D = g^d이고 B = A^d"를 `proof.ts`와 같은 Chaum–Pedersen으로 보인다.
- e/t를 그대로 내면 t가 짧아 격자 축소로 e가 풀리고, e·t를 정수로 내면 여러 회의 최대공약수로 e가 샌다. 그래서 D만 먼저 정해 둔다.
- 가중치 묶음은 부분군 밖 값(±1 성분)을 반만 잡으므로 받은 원소마다 Jacobi 기호로 이차잉여를 본다(53개 약 7ms).
- 도전값: Fiat–Shamir면 부정한 사람이 해시를 거듭 돌려 원하는 비트를 노릴 수 있어 k ≥ 40~64가 필요하다. 모든 기기가 섞을 때 H(nonce)를 내고 섞기가 끝난 뒤 nonce를 공개해 **공동 도전값**을 만들면 노릴 수 없어 k = 16~20이면 된다.

붙이는 자리:
- shuffle·poolShuffle 메시지에 H(nonce)를 붙이고, 회차 증명은 덱을 넘긴 뒤 `shuffleProof`로 뒤따라 보낸다(하트 넘기기의 "열쇠 먼저, 증명 뒤따라"와 같은 꼴).
- 모든 섞기가 끝나면 nonce 공개 → 공동 도전값 → 각자 응답.
- 확인은 Worker에서, 나눠 준 직후 시작해 첫 카드 전에 끝낸다. 틀리면 지금 `problem`처럼 그 기기를 짚는다. 저사양 기기는 "문제가 생겼을 때만 확인"으로 둘 수 있다.
- 함께 막을 빈틈: 6·7마 `convert`(O[i] = I[i]^(e/k_i), 순열 없음)도 지금 증명이 없다. relock처럼 g^e를 미리 내고 공개한 자리 열쇠로 묶음 Chaum–Pedersen을 확인하면 덮인다.
- 주의: 카드 표현 (i+2)²에는 곱 관계가 있다(4·9 = 36). 원소 사이 이산로그 관계를 모른다는 가정에 기대는 논증(순열 커밋류)은 첫 덱에서 따져 봐야 한다. 위 설계는 D를 먼저 정해 두어 이 가정에 기대지 않는다.

## 계산 시간 (Node 24, 이 맥, `sra.ts`의 `modPow`)

| 연산 | 시간 |
|---|---|
| 2048비트 지수 | 9.9ms |
| 320비트 지수 | 1.8ms |
| 64비트 지수 | 0.24ms |
| 53장 다중 거듭제곱(64비트) | 5.1ms |
| 53장 다중 거듭제곱(320비트) | 15.6ms |
| Jacobi 기호 | 0.125ms |
| secp256k1 점 곱(기준점이 바뀔 때 / 고정) | 1.7ms / 0.12ms |

| 방식 (53장, 증명 1개) | 증명 | 확인 1개 | 메시지 |
|---|---|---|---|
| cut-and-choose k=16(공동 도전값) | 약 2초 | 약 0.55초 | 110~220KB |
| cut-and-choose k=40(Fiat–Shamir) | 약 5초 | 약 1.4초 | 270~540KB |
| Neff 2001(지금 군) | 약 4.3초 | 약 4.7초(줄이면 1~2초) | 약 110KB |
| Neff를 Schnorr 군(q 256비트)으로 | 약 0.6초(추정) | 약 0.7초 | 약 30KB |
| EC ElGamal + Bayer–Groth(JS) | 0.3~1초(추정) | 비슷 | 약 5.5KB |

- 한 기기는 남의 섞기 증명 (인원−1)개를 확인한다. 6·7마는 poolShuffle 증명이 더 붙는다.
- "EC가 50배 빠르다"는 기대는 맞지 않다. 기준점이 바뀌는 점 곱(1.7ms)은 우리 320비트 거듭제곱(1.8ms)과 비슷하다. 이점은 증명 속 무작위 지수가 256비트로 짧고 메시지가 작다는 데서 온다.

## 기존 구현체

- geometryxyz/mental-poker: Rust/arkworks, Barnett–Smart + Bayer–Groth, MIT/Apache, 2022년.
- ziffle: Rust `no_std`, Bayer–Groth, MIT/Apache, 0.1.0, 감사 없음. wasm-bindgen으로 감싸기 가장 쉬워 보인다.
- zshuffle(Zypher): Rust + wasm, BabyJubjub, **GPL-3.0**, 체인용 PlonK 계열이라 결이 다르다.
- 학습·발표 목적이면 직접 구현, 안정성 목적이면 ziffle을 WASM으로.

## 추천 순서 (데브세미나 흐름으로도)

1. cut-and-choose(지금 SRA 그대로): "½씩 줄어드는 거짓말 확률", 가중치 묶음, Chaum–Pedersen 재사용.
2. Neff의 다항식 아이디어는 설명이나 작은 장난감으로: "한 번에 2^-2000"과 비용의 맞바꿈.
3. EC ElGamal + Bayer–Groth.
4. 낸 카드·무늬 증명(Groth–Kohlweiss, Bultel–Lafourcade, Bella 외).

## 출처 (✅ 원문 확인 / ◐ 초록·요약만)

- ✅ C. A. Neff, "A Verifiable Secret Shuffle and its Application to E-Voting", CCS 2001. https://www.freehaven.net/anonbib/cache/shuffle:ccs01.pdf
- ◐ C. A. Neff, "Verifiable Mixing (Shuffling) of ElGamal Pairs", 2004. https://pkg.go.dev/go.dedis.ch/kyber/shuffle
- ◐ J. Groth, "A Verifiable Secret Shuffle of Homomorphic Encryptions", PKC 2003 / JoC 2010. https://eprint.iacr.org/2005/246
- ◐ S. Bayer, J. Groth, "Efficient Zero-Knowledge Argument for Correctness of a Shuffle", EUROCRYPT 2012. Bayer 박사논문 https://discovery-pp.ucl.ac.uk/1416402/1/Bayer_Stephanie_Thesis_13.12.13.pdf
- ◐ J. Groth, M. Kohlweiss, "One-out-of-Many Proofs", EUROCRYPT 2015. https://eprint.iacr.org/2014/764
- ◐ D. Wikström, "A Commitment-Consistent Proof of a Shuffle", ACISP 2009. https://eprint.iacr.org/2011/168
- ◐ K. Sako, J. Kilian, "Receipt-Free Mix-Type Voting Scheme", EUROCRYPT 1995(Neff 논문의 인용으로만)
- ◐ C. Schindelhauer, "A Toolbox for Mental Card Games", 1998 / A. Barnett, N. Smart, "Mental Poker Revisited", 2003
- ✅(README) https://github.com/geometryxyz/mental-poker · ✅(docs.rs) https://docs.rs/ziffle · ◐ https://lib.rs/crates/zshuffle

계산 시간과 "짧은 t + D 미리 정하기, Jacobi 확인, 공동 nonce" 설계는 조사하며 세운 분석이다. 논문에서 그대로 가져온 것이 아니므로 구현 전에 검토한다.
