import { sha256, taggedHash, utf8 } from "@mighty/stardraw-core";

import { NAMES } from "./names";
import {
  ARM_PLACES,
  type Area,
  OTHER_GALAXY_PLACES,
  type Place,
} from "./places";

/**
 * 우주인 등록증(docs/36 11-9). 공개 열쇠 하나에서 모두 결정적으로 계산한다:
 * 같은 공개 열쇠면 어느 기기에서든 같은 등록증이다. 서버·장부 형식은 바꾸지 않는다(등록 회차만 장부에서 읽는다).
 *
 * 씨앗 s = taggedHash("stardraw/astronaut/v2", 공개 열쇠 65바이트)
 * - s[0..5)  등록번호 40비트 → Crockford base32 8자(SD-XXXX-XXXX). 사람을 가르는 값은 이것뿐이다
 * - s[5..7)  다른 은하 주사위: 값 < GALAXY_ROLL이면 다른 은하 목록(1/512). 목록 길이와 상관없다
 * - s[7..9)  드문 사진 주사위: 값 < EGG_ROLL이면 드문 사진(1/2048)
 * - s[9]     헬멧(4분의 1), s[10..14) 배경 별 자리 씨앗
 * 이름·주소(지구면 대륙까지)·드문 사진 종류·얼굴 부위는 목록에서 **랑데부 해싱**으로 고른다(`rendezvous`).
 * 항목마다 점수 = sha256(s ‖ 종류 ‖ 0 ‖ 항목 id)이고 점수가 가장 높은 항목을 고른다. 그래서
 * - 목록에 항목을 더해도 기존 우주인은 그대로다(새 항목이 이긴 약 1/(n+1)만 그리로 옮긴다)
 * - 항목을 빼면 그 항목을 골랐던 사람만 다음 순위로 옮긴다
 * - 목록 차례나 화면 이름을 바꿔도 아무도 옮기지 않는다. id만 바꾸지 않으면 된다
 * 이름·주소는 동명이인처럼 겹칠 수 있다.
 */
export const ASTRONAUT_TAG = "stardraw/astronaut/v2";

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
/** 드문 사진 종류(값이 곧 id) */
export const EGGS: readonly Egg[] = ["laika", "prince", "rabbit"];

/** 외계인 얼굴 부위(값은 각 부위 그림 번호) */
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

export type FacePart = "skin" | "head" | "eyes" | "antenna" | "mouth" | "marks";

/**
 * 부위마다 고를 수 있는 그림 번호(Avatar.tsx의 그림 차례). 번호가 곧 id다.
 * 그림을 더하면 새 번호를 끝에 더한다(기존 얼굴은 그대로). 그림을 빼면 그 번호만 목록에서 지우고, 번호를 다른 그림에 다시 쓰지 않는다.
 */
export const FACE_PARTS: Readonly<Record<FacePart, readonly number[]>> = {
  skin: [0, 1, 2, 3, 4, 5, 6, 7],
  head: [0, 1, 2, 3, 4],
  eyes: [0, 1, 2, 3, 4, 5],
  antenna: [0, 1, 2, 3, 4],
  mouth: [0, 1, 2, 3, 4, 5],
  marks: [0, 1, 2, 3],
};

export interface Astronaut {
  /** SD-XXXX-XXXX */
  number: string;
  name: string;
  /** 주소 전체 경로(우리 우주부터) */
  address: readonly string[];
  /** 카드에 보일 짧은 경로(우리 은하 또는 그 은하부터) */
  short: readonly string[];
  /** 인사·공유 문구의 "OOO에 거주하는": 끝 천체 이름 하나, 지구 대륙이면 "지구 남극" */
  home: string;
  /** 고른 주소의 id(지구면 대륙 id) */
  placeId: string;
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

/** 해시 앞 53비트 → (0, 1) 사이 균등한 값(0과 1은 나오지 않는다) */
function unit(h: Uint8Array): number {
  return (u32(h, 0) * 2 ** 21 + (u32(h, 4) >>> 11) + 0.5) / 2 ** 53;
}

const encoded = new Map<string, Uint8Array>();
function bytesOf(text: string): Uint8Array {
  let b = encoded.get(text);
  if (!b) {
    b = utf8(text);
    encoded.set(text, b);
  }
  return b;
}

/**
 * 가중 랑데부 해싱(HRW). 항목마다 u = sha256(씨앗 ‖ 종류 ‖ 0 ‖ id)에서 만든 (0,1) 값,
 * 점수 = -가중치 / ln(u). 가장 높은 항목을 고른다. 가중치가 w인 항목이 뽑힐 확률은 w / (가중치 합)이다.
 * `kind`가 다르면 같은 id라도 점수가 따로 나온다(얼굴 부위끼리 같은 번호가 함께 움직이지 않게).
 */
export function rendezvous<T>(
  seed: Uint8Array,
  kind: string,
  items: readonly T[],
  idOf: (item: T) => string,
  weightOf: (item: T) => number = () => 1,
): T {
  if (items.length === 0) throw new Error(`빈 목록: ${kind}`);
  // 하나뿐이면 점수를 셀 것도 없다(결과는 같다)
  if (items.length === 1) return items[0] as T;
  const prefix = bytesOf(`${kind}\0`);
  let best = items[0] as T;
  let bestScore = -Infinity;
  for (const item of items) {
    const w = weightOf(item);
    if (!(w > 0)) continue;
    const score =
      -w / Math.log(unit(sha256(seed, prefix, bytesOf(idOf(item)))));
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export interface AstronautLists {
  /** 이름 목록(이름이 곧 id라 이름을 고치지 않는다) */
  names: readonly string[];
  arm: readonly Place[];
  galaxies: readonly Place[];
  face: Readonly<Record<FacePart, readonly number[]>>;
}

const LISTS: AstronautLists = {
  names: NAMES,
  arm: ARM_PLACES,
  galaxies: OTHER_GALAXY_PLACES,
  face: FACE_PARTS,
};

const byId = (p: { id: string }) => p.id;
const self = (s: string) => s;

/** 씨앗에서 등록증을 계산한다(목록은 시험에서 바꿔 넣을 수 있다) */
export function astronautFromHash(
  s: Uint8Array,
  lists: AstronautLists = LISTS,
): Astronaut {
  const raw = crockford40(s);
  const number = `SD-${raw.slice(0, 4)}-${raw.slice(4)}`;
  const name = rendezvous(s, "name", lists.names, self);
  const otherGalaxy = u16(s, 5) < GALAXY_ROLL;
  const place = otherGalaxy
    ? rendezvous(s, "galaxy", lists.galaxies, byId)
    : rendezvous(s, "place", lists.arm, byId);
  const area: Area | null = place.areas?.length
    ? rendezvous(s, "area", place.areas, byId)
    : null;
  const path = area ? [...place.path, area.name] : place.path;
  const address = otherGalaxy
    ? [COSMIC_PATH[0], ...path]
    : [...COSMIC_PATH, ...ARM_PATH, ...path];
  // 짧은 경로: 우리 은하부터, 다른 은하는 끝의 세 단계(예: 국부은하군 › 안드로메다은하 › M32)
  const short = otherGalaxy
    ? address.slice(-3)
    : address.slice(COSMIC_PATH.length);
  const body = place.path[place.path.length - 1] as string;
  const egg =
    u16(s, 7) < EGG_ROLL
      ? rendezvous(s, "egg", EGGS, self as (e: Egg) => string)
      : null;
  const part = (p: FacePart) =>
    rendezvous(s, `face/${p}`, lists.face[p], String);
  const face: Face = {
    skin: part("skin"),
    head: part("head"),
    eyes: part("eyes"),
    antenna: part("antenna"),
    mouth: part("mouth"),
    marks: part("marks"),
    helmet: (s[9] ?? 0) % 4 === 0,
    sky: u32(s, 10),
  };
  return {
    number,
    name,
    address,
    short,
    home: area ? `${body} ${area.name}` : body,
    placeId: area ? area.id : place.id,
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

/** 인사·공유 문구: "트라피스트-1 e에 거주하는 노을별", "지구 남극에 거주하는 노을별" */
export function residentPhrase(a: Astronaut): string {
  return `${a.home}에 거주하는 ${a.name}`;
}
