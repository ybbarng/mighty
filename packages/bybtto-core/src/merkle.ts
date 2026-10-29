import { compareBytes, equalBytes, sha256 } from "./bytes";

/**
 * RFC 6962 머클 트리(docs/36 8-1 S2).
 * 잎은 0x00, 가지는 0x01을 앞에 붙여 해시해, 가지 값을 잎인 척하는 위조를 막는다.
 * n개를 나눌 때는 n보다 작은 가장 큰 2의 거듭제곱 k에서 왼쪽 k개, 오른쪽 나머지로 나눈다.
 * 빕또의 잎은 응모권 id이고, id 사전 순으로 정렬해 넣는다(`sortLeaves`).
 */

export function leafHash(leaf: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([0]), leaf);
}

export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([1]), left, right);
}

export function sortLeaves(leaves: readonly Uint8Array[]): Uint8Array[] {
  return [...leaves].sort(compareBytes);
}

function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** 머클 루트. 빈 목록은 빈 바이트의 해시 */
export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256();
  return subtreeRoot(leaves.map(leafHash));
}

function subtreeRoot(hashes: readonly Uint8Array[]): Uint8Array {
  if (hashes.length === 1) return hashes[0] as Uint8Array;
  const k = split(hashes.length);
  return nodeHash(
    subtreeRoot(hashes.slice(0, k)),
    subtreeRoot(hashes.slice(k)),
  );
}

/** index번째 잎의 포함 증명(아래에서 위로 형제 해시) */
export function inclusionProof(
  leaves: readonly Uint8Array[],
  index: number,
): Uint8Array[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error("잎 번호가 범위 밖이다");
  }
  return path(index, leaves.map(leafHash));
}

function path(index: number, hashes: readonly Uint8Array[]): Uint8Array[] {
  if (hashes.length <= 1) return [];
  const k = split(hashes.length);
  if (index < k)
    return [...path(index, hashes.slice(0, k)), subtreeRoot(hashes.slice(k))];
  return [...path(index - k, hashes.slice(k)), subtreeRoot(hashes.slice(0, k))];
}

/** RFC 9162 2.1.3.2의 확인 방식 */
export function verifyInclusion(
  leaf: Uint8Array,
  index: number,
  size: number,
  proof: readonly Uint8Array[],
  root: Uint8Array,
): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= size) return false;
  let fn = index;
  let sn = size - 1;
  let r = leafHash(leaf);
  for (const p of proof) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equalBytes(r, root);
}
