import { bls12_381 } from "@noble/curves/bls12-381.js";
import { ByteWriter, equalBytes, fromHex, sha256 } from "./bytes";

/**
 * drand quicknet(League of Entropy, 3초마다, BLS 서명이 G1).
 * 체인 해시·공개 열쇠는 규칙에 고정한다(docs/36 8-1 O8). 다른 체인 값은 받지 않는다.
 */
export const QUICKNET = {
  hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  genesisTime: 1692803367,
  period: 3,
  scheme: "bls-unchained-g1-rfc9380",
} as const;

const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

/** 마감 뒤 이만큼 지나 나오는 drand 회차를 쓴다(그 사이에 머클 루트를 Rekor에 올린다) */
export const DRAND_DELAY = 5 * 60;

export interface DrandBeacon {
  round: number;
  /** BLS 서명 48바이트 */
  signature: Uint8Array;
}

export function drandTime(round: number): number {
  return QUICKNET.genesisTime + (round - 1) * QUICKNET.period;
}

/** 시각 t 이후(같거나 뒤) 처음 나오는 drand 회차 */
export function drandRoundAtOrAfter(t: number): number {
  if (t <= QUICKNET.genesisTime) return 1;
  return Math.ceil((t - QUICKNET.genesisTime) / QUICKNET.period) + 1;
}

/** 마감 시각 → 그 회차가 쓸 drand 회차. 운영자가 고를 수 없게 계산식으로 정해져 있다 */
export function drandRoundForClose(closesAt: number): number {
  return drandRoundAtOrAfter(closesAt + DRAND_DELAY);
}

/** drand 난수 = 서명의 SHA-256 */
export function drandRandomness(beacon: DrandBeacon): Uint8Array {
  return sha256(beacon.signature);
}

/** 서명 확인을 바꿔 끼울 수 있게 함수 형태로 둔다(시험·느린 기기) */
export type BeaconVerifier = (beacon: DrandBeacon) => boolean;

/** quicknet 서명 확인: 메시지는 회차 번호(u64)의 SHA-256 */
export const verifyQuicknetBeacon: BeaconVerifier = (beacon) => {
  if (beacon.signature.length !== 48) return false;
  try {
    const message = sha256(new ByteWriter().u64(beacon.round).done());
    const point = bls12_381.shortSignatures.hash(message, DST);
    return bls12_381.shortSignatures.verify(
      beacon.signature,
      point,
      fromHex(QUICKNET.publicKey),
    );
  } catch {
    return false;
  }
};

/** API 응답의 randomness가 서명과 맞는지(서명을 믿고 쓰기 전 간단 확인) */
export function randomnessMatches(
  beacon: DrandBeacon,
  randomness: Uint8Array,
): boolean {
  return equalBytes(drandRandomness(beacon), randomness);
}
