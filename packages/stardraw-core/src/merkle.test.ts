import { describe, expect, it } from "vitest";
import { fromHex, toHex } from "./bytes";
import {
  inclusionProof,
  merkleRoot,
  sortLeaves,
  verifyInclusion,
} from "./merkle";

// Certificate Transparency 참조 구현의 RFC 6962 시험 값
const LEAVES = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
].map(fromHex);
const ROOTS = [
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
  "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
  "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
  "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4",
  "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef",
  "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
  "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
];

describe("RFC 6962 머클 루트", () => {
  it("참조 구현과 같은 루트(크기 1~8)", () => {
    for (let n = 1; n <= 8; n++)
      expect(toHex(merkleRoot(LEAVES.slice(0, n)))).toBe(ROOTS[n - 1]);
  });

  it("빈 목록은 빈 바이트의 해시", () => {
    expect(toHex(merkleRoot([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("포함 증명", () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      fromHex(i.toString(16).padStart(64, "0")),
    );

  it("크기 1~33의 모든 잎이 증명된다", () => {
    for (let n = 1; n <= 33; n++) {
      const leaves = ids(n);
      const root = merkleRoot(leaves);
      for (let i = 0; i < n; i++) {
        expect(
          verifyInclusion(
            leaves[i] as Uint8Array,
            i,
            n,
            inclusionProof(leaves, i),
            root,
          ),
        ).toBe(true);
      }
    }
  });

  it("다른 잎, 다른 자리, 다른 크기, 빠진 증명은 거절한다", () => {
    const leaves = ids(7);
    const root = merkleRoot(leaves);
    const proof = inclusionProof(leaves, 3);
    expect(verifyInclusion(leaves[4] as Uint8Array, 3, 7, proof, root)).toBe(
      false,
    );
    expect(verifyInclusion(leaves[3] as Uint8Array, 2, 7, proof, root)).toBe(
      false,
    );
    // 크기 자체는 기록의 count로 묶인다. 증명 모양이 달라지는 크기면 여기서도 거절된다
    expect(verifyInclusion(leaves[3] as Uint8Array, 3, 4, proof, root)).toBe(
      false,
    );
    expect(
      verifyInclusion(leaves[3] as Uint8Array, 3, 7, proof.slice(1), root),
    ).toBe(false);
    expect(verifyInclusion(leaves[3] as Uint8Array, 7, 7, proof, root)).toBe(
      false,
    );
  });

  it("가지 값을 잎인 척해도 통과하지 못한다(잎 0x00, 가지 0x01)", () => {
    const leaves = ids(4);
    const root = merkleRoot(leaves);
    // 크기 2 트리의 왼쪽 가지 = 잎 0·1을 묶은 값. 이것을 잎으로 내밀어 본다
    const left = inclusionProof(leaves, 2).at(-1) as Uint8Array;
    const right = inclusionProof(leaves, 0).at(-1) as Uint8Array;
    expect(verifyInclusion(left, 0, 2, [right], root)).toBe(false);
  });

  it("잎은 id 사전 순으로 정렬한다", () => {
    const shuffled = [fromHex("03"), fromHex("01"), fromHex("02")];
    expect(sortLeaves(shuffled).map(toHex)).toEqual(["01", "02", "03"]);
  });
});
