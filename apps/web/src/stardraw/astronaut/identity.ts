import { taggedHash } from "@mighty/stardraw-core";

import { NAMES } from "./names";
import { ARM_PLACES, OTHER_GALAXY_PLACES, type Place } from "./places";

/**
 * 우주인 등록증(docs/36 11-9). 공개 열쇠 하나에서 모두 결정적으로 계산한다:
 * 같은 공개 열쇠면 어느 기기에서든 같은 등록증이다. 서버·장부 형식은 바꾸지 않는다(등록 회차만 장부에서 읽는다).
 *
 * 바이트 배치: h = taggedHash("stardraw/astronaut/v1", 공개 열쇠 65바이트)
 * - h[0..5)  등록번호 40비트 → Crockford base32 8자(SD-XXXX-XXXX). 사람을 가르는 값은 이것뿐이다
 * - h[5..9)  이름(목록 길이로 나눈 나머지)
 * - h[9..11) 다른 은하 주사위: 값 < GALAXY_ROLL이면 다른 은하 목록(1/512)
 * - h[11..15) 주소(고른 목록 길이로 나눈 나머지)
 * - h[15..17) 드문 사진 주사위: 값 < EGG_ROLL이면 드문 사진(1/2048), h[17] % 3으로 셋 중 하나
 * - h[18..32) 외계인 얼굴 부위
 * 이름·주소는 동명이인처럼 겹칠 수 있다.
 */
export const ASTRONAUT_TAG = "stardraw/astronaut/v1";

/** 다른 은하 주소: 65536분의 128 = 1/512 */
export const GALAXY_ROLL = 128;
/** 드문 사진: 65536분의 32 = 1/2048(셋이라 하나하나는 약 1/6144) */
export const EGG_ROLL = 32;

/** 주소 앞부분(카드에서는 줄이고, 펼치면 전체). 우리 은하는 처녀자리 은하단이 아니라 국부은하군에 속한다 */
export const COSMIC_PATH = [
  "우리 우주",
  "라니아케아 초은하단",
  "처녀자리 초은하단",
  "국부은하군",
] as const;
export const ARM_PATH = ["우리 은하", "오리온 팔"] as const;

export type Egg = "laika" | "prince" | "rabbit";
export const EGGS: readonly Egg[] = ["laika", "prince", "rabbit"];

/** 외계인 얼굴 부위(값은 각 목록의 차례) */
export interface Face {
  skin: number;
  head: number;
  eyes: number;
  antenna: number;
  mouth: number;
  marks: number;
  helmet: boolean;
  /** 배경 별 자리 씨앗 */
  sky: number;
}

export const FACE_PARTS = {
  skin: 8,
  head: 5,
  eyes: 6,
  antenna: 5,
  mouth: 6,
  marks: 4,
} as const;

export interface Astronaut {
  /** SD-XXXX-XXXX */
  number: string;
  name: string;
  /** 주소 전체 경로(우리 우주부터) */
  address: readonly string[];
  /** 카드에 보일 짧은 경로(우리 은하 또는 그 은하부터) */
  short: readonly string[];
  /** 가장 끝 천체 이름(인사·공유 문구의 "OOO에 거주하는") */
  home: string;
  /** 지구에서 거리(광년, 태양계 밖 항성계만) */
  ly?: number;
  otherGalaxy: boolean;
  face: Face;
  egg: Egg | null;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 40비트(5바이트) → Crockford base32 8자 */
export function crockford40(bytes: Uint8Array): string {
  let v = 0n;
  for (let i = 0; i < 5; i++) v = (v << 8n) | BigInt(bytes[i] ?? 0);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = (CROCKFORD[Number(v & 31n)] as string) + out;
    v >>= 5n;
  }
  return out;
}

const u16 = (h: Uint8Array, i: number) => ((h[i] ?? 0) << 8) | (h[i + 1] ?? 0);
const u32 = (h: Uint8Array, i: number) =>
  (((h[i] ?? 0) << 24) >>> 0) +
  ((h[i + 1] ?? 0) << 16) +
  ((h[i + 2] ?? 0) << 8) +
  (h[i + 3] ?? 0);

export interface AstronautLists {
  names: readonly string[];
  arm: readonly Place[];
  galaxies: readonly Place[];
}

const LISTS: AstronautLists = {
  names: NAMES,
  arm: ARM_PLACES,
  galaxies: OTHER_GALAXY_PLACES,
};

/** 해시에서 등록증을 계산한다(목록은 시험에서 바꿔 넣을 수 있다) */
export function astronautFromHash(
  h: Uint8Array,
  lists: AstronautLists = LISTS,
): Astronaut {
  const raw = crockford40(h);
  const number = `SD-${raw.slice(0, 4)}-${raw.slice(4)}`;
  const name = lists.names[u32(h, 5) % lists.names.length] as string;
  const otherGalaxy = u16(h, 9) < GALAXY_ROLL;
  const list = otherGalaxy ? lists.galaxies : lists.arm;
  const place = list[u32(h, 11) % list.length] as Place;
  const address = otherGalaxy
    ? [COSMIC_PATH[0], ...place.path]
    : [...COSMIC_PATH, ...ARM_PATH, ...place.path];
  // 짧은 경로: 우리 은하부터, 다른 은하는 끝의 세 단계(예: 국부은하군 › 안드로메다은하 › M32)
  const short = otherGalaxy
    ? address.slice(-3)
    : address.slice(COSMIC_PATH.length);
  const egg =
    u16(h, 15) < EGG_ROLL ? (EGGS[(h[17] ?? 0) % EGGS.length] as Egg) : null;
  const face: Face = {
    skin: (h[18] ?? 0) % FACE_PARTS.skin,
    head: (h[19] ?? 0) % FACE_PARTS.head,
    eyes: (h[20] ?? 0) % FACE_PARTS.eyes,
    antenna: (h[21] ?? 0) % FACE_PARTS.antenna,
    mouth: (h[22] ?? 0) % FACE_PARTS.mouth,
    marks: (h[23] ?? 0) % FACE_PARTS.marks,
    helmet: (h[24] ?? 0) % 4 === 0,
    sky: u32(h, 25),
  };
  return {
    number,
    name,
    address,
    short,
    home: place.path[place.path.length - 1] as string,
    ...(place.ly !== undefined ? { ly: place.ly } : {}),
    otherGalaxy,
    face,
    egg,
  };
}

/** 공개 열쇠(65바이트 원시 P-256) → 등록증 */
export function astronautOf(pub: Uint8Array): Astronaut {
  return astronautFromHash(taggedHash(ASTRONAUT_TAG, pub));
}

/** 인사·공유 문구: "트라피스트-1 e에 거주하는 노을별" */
export function residentPhrase(a: Astronaut): string {
  return `${a.home}에 거주하는 ${a.name}`;
}
