import type { ThrowValue, YutRules } from "./rules";
import { sha256Hex } from "./sha256";

/**
 * 던지기 해시 사슬(docs/37 5절).
 * 기기가 씨앗 x_N을 만들고 x_{i-1} = H(x_i)를 N번 돌려 x_0을 약속으로 낸다.
 * 던질 때마다 모든 자리가 다음 고리 x_1, x_2, …를 차례로 공개하고, 엔진은 H(x_i) = x_{i-1}을 확인한다.
 * 결과는 그 던지기에 공개된 모든 자리 고리를 섞은 해시로 정한다. 누구도 남의 다음 고리를 모른다.
 */

/** 사슬 길이(한 번 약속으로 던질 수 있는 횟수) */
export const CHAIN_LENGTH = 600;

export const LINK_PATTERN = /^[0-9a-f]{64}$/;

/** 사슬 한 고리 앞으로(공개된 고리를 해시하면 앞 고리가 된다) */
export function chainHash(link: string): string {
  return sha256Hex(`yut-chain|${link}`);
}

/** 씨앗에서 i번째 고리(0이 약속, CHAIN_LENGTH가 씨앗). 해시를 CHAIN_LENGTH - i번 돌린다 */
export function chainLink(seed: string, index: number): string {
  let link = seed;
  for (let k = index; k < CHAIN_LENGTH; k++) link = chainHash(link);
  return link;
}

/** 씨앗의 약속(x_0) */
export function chainCommit(seed: string): string {
  return chainLink(seed, 0);
}

/** 자리마다 컴퓨터가 쓰는 재료(시드에서 만든다). 그 자리 화면에만 보인다 */
export function seatKey(seed: number, seat: number): string {
  return sha256Hex(`yut-key|${seed >>> 0}|${seat}`);
}

/** 재료와 세대(사슬을 다 써서 다시 약속한 횟수)로 씨앗을 만든다(컴퓨터·혼자 하기·끊긴 사이 대신 약속) */
export function derivedSeed(key: string, generation: number): string {
  return sha256Hex(`yut-seed|${key}|${generation}`);
}

/** 가락 넷의 앞뒷면. true가 평평한 면(배)이 위. 0번 가락에 빽도 표시가 있다 */
export type Sticks = [boolean, boolean, boolean, boolean];

/** 이번 던지기에 공개된 모든 자리 고리로 가락 넷을 정한다 */
export function sticksFrom(
  throwIndex: number,
  links: readonly string[],
  flatPercent: number,
): Sticks {
  const h = sha256Hex(`yut-throw|${throwIndex}|${links.join("|")}`);
  const limit = Math.round((flatPercent / 100) * 65536);
  const sticks: boolean[] = [];
  for (let i = 0; i < 4; i++)
    sticks.push(Number.parseInt(h.slice(i * 4, i * 4 + 4), 16) < limit);
  return sticks as Sticks;
}

/** 가락 넷의 결과. 평평한 개수 1 도(빽도 규칙이 있고 0번 가락 하나만이면 빽도), 2 개, 3 걸, 4 윷, 0 모 */
export function valueOfSticks(
  sticks: Sticks,
  rules: Pick<YutRules, "backDo">,
): ThrowValue {
  const flats = sticks.filter(Boolean).length;
  if (flats === 0) return 5;
  if (flats === 1) return rules.backDo && sticks[0] ? -1 : 1;
  return flats as 2 | 3 | 4;
}
