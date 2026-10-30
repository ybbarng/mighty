import { describe, expect, it } from "vitest";

import { fromHex, sha256, toHex, utf8 } from "./bytes";
import {
  pemFromRaw,
  REKOR_PRODUCTION,
  REKOR_STAGING,
  type RekorEntryProof,
  rekorLogFor,
  rekorProofFromResponse,
  verifyRekorEntry,
} from "./rekor";
import { rawPublicKeyFromSpki } from "./signature";

/**
 * 2026-10-30 시험용 Rekor(rekor.sigstage.dev)에 실제로 올린 항목 하나(임시 열쇠, 봉인 값 대신 고정 32바이트).
 * 네트워크 없이 같은 응답으로 확인 규칙을 시험한다.
 */
const FIXTURE = {
  digestHex: "45c44ee16ddeca69a9e6a1bef4fabf58288e26c4447039c114d81eeb2c046c5c",
  serverSpkiHex:
    "3059301306072a8648ce3d020106082a8648ce3d0301070342000493dfbbb7ba0a1d6ff8b33b8e8a01acf355e84ba4c412b2e4b5c99fa9348a0562ee95d1de706ada66c525268858f07ee751f068982774af4315d46a94b562e50d",
  response: {
    "71d46696179fcd5d1009563ddfca2a206cbc286d4645593749ac29a128bfdddd77980b1436c4d0e3":
      {
        body: "eyJhcGlWZXJzaW9uIjoiMC4wLjEiLCJraW5kIjoiaGFzaGVkcmVrb3JkIiwic3BlYyI6eyJkYXRhIjp7Imhhc2giOnsiYWxnb3JpdGhtIjoic2hhMjU2IiwidmFsdWUiOiIxOGE0ZWZhZjYwYzFlYjRmNTlhNDYxODJlOGI1MjBjZDhkNWZjZWJmMmVjMmFhNzM2ZTUwZjVmMDgxYzk5MjIwIn19LCJzaWduYXR1cmUiOnsiY29udGVudCI6Ik1FWUNJUUNiNnIvMUptVlVtVWFnS1ZaS3BRMmFZRTc3MUlBOC9JN0xKbnFqSlFmNVZnSWhBS1JXUmN1QmcxUnRHTzJhb0QyTC9MMGJHdHdSZ2VPc3JxTHA0c1FwYjNQNiIsInB1YmxpY0tleSI6eyJjb250ZW50IjoiTFMwdExTMUNSVWRKVGlCUVZVSk1TVU1nUzBWWkxTMHRMUzBLVFVacmQwVjNXVWhMYjFwSmVtb3dRMEZSV1VsTGIxcEplbW93UkVGUlkwUlJaMEZGYXprck4zUTNiMHRJVnk4MGMzcDFUMmxuUjNNNE1WaHZVelpVUlFwRmNreHJkR050Wm5GVVUwdENWMHgxYkdSSVpXTkhjbUZhYzFWc1NtOW9XVGhJTjI1VlprSnZiVU5rTUhJd1RWWXhSM0ZWZEZkTWJFUlJQVDBLTFMwdExTMUZUa1FnVUZWQ1RFbERJRXRGV1MwdExTMHRDZz09In19fX0=",
        integratedTime: 1793324413,
        logID:
          "d32f30a3c32d639c2b762205a21c7bb07788e68283a4ae6f42118723a1bea496",
        logIndex: 56702655,
        verification: {
          inclusionProof: {
            checkpoint:
              "rekor.sigstage.dev - 8202293616175992157\n25020244\nmYLyvCkkgSpxqzNyrkh10fr3LM0a3rq2i71nM2UVepk=\n\n— rekor.sigstage.dev 0y8wozBFAiEA0LRrGS9p+GmH7CISoP/vuLrcs04OAIgHIytnrwr1RtgCIDoLa4rXBbeAfjGiB8deSnmq0YVjMIb8lt0HE2hnc7WP\n",
            hashes: [
              "e66d9de8b876dccd25d7e42130efdc7b366be142ba9b36d9d11681da71358d9c",
              "a1df198b0a921305f3cb762c9cfe7e2c335600c84bf45b05c091b85ad2408457",
              "921085a699e2f9253443fbf4e5c13b28647a471887bfc7d33368638b8acc8d6b",
              "6e73ea99a822ceafe255e74ff1fe842cf49c85e4d34f0071fc7ec2aa6717a062",
              "ac71a0fd16950a114657f660857b6f3f6fd1aa73266b052284d757b874b3645a",
              "6e3a5add2935bd0c59d44da462267e397774c5e0d7fd37900e69110759398071",
              "f37f6cf09e6786e12c96f89eda01e3efb9d5bf81a3a81ab68041c2181ef6564c",
              "c8fb1fc2797c8c9e20c71b7885d9a3f00e53557114af3e08f9caed901a25f170",
              "f6b31be5b65d3421d94b9985f5041ba3cc68df0e4b11f2cfd171a034d7b35cab",
              "8587308f70b4a528ba23125d61dd1d88cd4fc61d257160299ad32048e7b67a29",
              "b5d4055ec6e80b6f494b875d5df54eedcaa8ce6c89dc9ba26b3c6a0236211e40",
              "79700fc019c685fc3545b4a373c2762f3542db3f6e029b34f9662ae64487ffb6",
              "8d33b7fc5319f726b14247b6a15040c411b6d06a2e39fad34c03652a0cb966d2",
              "f512d5880b5ac710dbea25d88a466024a8b2e48f71aa0868a9b781b85d2a63af",
              "fe9703726b541702161a2f993102c5f32484d5f557da461ed275203ee74f759d",
              "06b8d8b18be8eb97530d628ef1a634b3ef566961e555d66e384cec0472c77bc5",
            ],
            logIndex: 25020243,
            rootHash:
              "9982f2bc2924812a71ab3372ae4875d1faf72ccd1adebab68bbd673365157a99",
            treeSize: 25020244,
          },
          signedEntryTimestamp:
            "MEUCIQCYLbw/I11EYBpi1AXTlf7VkmZ9oePyUOSSb3qujmNTYwIgb+c2/WLiGLmkqcYiuNhErMPFENWZedZVUHge7IYw2OU=",
        },
      },
  },
};

const proof = rekorProofFromResponse(
  REKOR_STAGING.url,
  FIXTURE.response,
) as RekorEntryProof;
const digest = fromHex(FIXTURE.digestHex);
const serverPublicKey = rawPublicKeyFromSpki(fromHex(FIXTURE.serverSpkiHex));

describe("고정한 로그 열쇠", () => {
  it("logID는 공개 열쇠 SPKI의 SHA-256이다", () => {
    for (const log of [REKOR_STAGING, REKOR_PRODUCTION]) {
      const spki = Uint8Array.from(atob(log.publicKeySpki), (c) =>
        c.charCodeAt(0),
      );
      expect(toHex(sha256(spki))).toBe(log.logID);
    }
  });

  it("주소로 로그를 찾는다(끝의 / 무시), 모르는 주소는 없다", () => {
    expect(rekorLogFor("https://rekor.sigstage.dev/")).toBe(REKOR_STAGING);
    expect(rekorLogFor("https://rekor.sigstore.dev")).toBe(REKOR_PRODUCTION);
    expect(rekorLogFor("https://rekor.example")).toBeUndefined();
  });
});

describe("실제 시험용 Rekor 항목 확인", () => {
  it("응답을 장부 모양으로 옮긴다", () => {
    expect(proof).toMatchObject({
      kind: "rekor",
      url: "https://rekor.sigstage.dev",
      uuid: "71d46696179fcd5d1009563ddfca2a206cbc286d4645593749ac29a128bfdddd77980b1436c4d0e3",
      integratedTime: 1793324413,
      logIndex: 56702655,
    });
  });

  it("본문·SET·포함 증명·체크포인트가 모두 맞다", async () => {
    const check = await verifyRekorEntry(proof, { digest, serverPublicKey });
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("다른 봉인 값이면 거절한다", async () => {
    const other = sha256(utf8("다른 봉인"));
    const check = await verifyRekorEntry(proof, {
      digest: other,
      serverPublicKey,
    });
    expect(check.problems).toContain(
      "항목이 이 회차의 봉인 값을 담고 있지 않다",
    );
  });

  it("다른 서버 열쇠면 거절한다", async () => {
    const other = new Uint8Array(serverPublicKey);
    other[64] = (other[64] ?? 0) ^ 1;
    const check = await verifyRekorEntry(proof, {
      digest,
      serverPublicKey: other,
    });
    expect(check.problems).toContain("항목의 공개 열쇠가 서버 열쇠가 아니다");
  });

  it("시각(integratedTime)을 바꾸면 SET 서명이 깨진다", async () => {
    const check = await verifyRekorEntry(
      { ...proof, integratedTime: proof.integratedTime - 600 },
      { digest, serverPublicKey },
    );
    expect(check.problems).toContain(
      "Rekor의 서명된 항목 시각(SET)이 맞지 않는다",
    );
  });

  it("포함 증명 해시 하나를 바꾸면 루트까지 이어지지 않는다", async () => {
    const hashes = [...proof.inclusionProof.hashes];
    hashes[0] = "00".repeat(32);
    const check = await verifyRekorEntry(
      { ...proof, inclusionProof: { ...proof.inclusionProof, hashes } },
      { digest, serverPublicKey },
    );
    expect(check.problems).toContain(
      "포함 증명이 트리 루트까지 이어지지 않는다",
    );
  });

  it("체크포인트 내용을 바꾸면 서명이 깨진다", async () => {
    const checkpoint = proof.inclusionProof.checkpoint.replace(
      "rekor.sigstage.dev - 8202293616175992157",
      "rekor.sigstage.dev - 1",
    );
    const check = await verifyRekorEntry(
      { ...proof, inclusionProof: { ...proof.inclusionProof, checkpoint } },
      { digest, serverPublicKey },
    );
    expect(check.problems).toContain(
      "체크포인트 서명이 Rekor 열쇠와 맞지 않는다",
    );
  });

  it("정식 장부는 실제 로그만 받는다: 시험용 로그 항목을 거절한다", async () => {
    const check = await verifyRekorEntry(proof, {
      digest,
      serverPublicKey,
      logs: [REKOR_PRODUCTION],
    });
    expect(check.ok).toBe(false);
  });
});

describe("PEM", () => {
  it("65바이트 열쇠를 Rekor에 싣는 PEM으로 만든다(시험 값과 같은 모양)", () => {
    const pem = pemFromRaw(serverPublicKey);
    expect(pem.startsWith("-----BEGIN PUBLIC KEY-----\n")).toBe(true);
    expect(pem).toContain(
      "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEk9+7t7oKHW/4szuOigGs81XoS6TE",
    );
  });
});
