import { concat, fromHex, sha256, toBase64Url, toHex, utf8 } from "./bytes";
import {
  drandRandomness,
  drandRoundForClose,
  drandTime,
  verifyQuicknetBeacon,
} from "./drand";
import { drawNumbers, drawSeed, rankOf } from "./draw";
import { merkleRoot } from "./merkle";
import { POW_PARAMS, powHash } from "./pow";
import { genesisHash } from "./record";
import {
  encodeRegistration,
  type KeyRegistration,
  registrationId,
} from "./registration";
import { sealDigest } from "./round";
import { sasKeyFromPair, sasSecret, sasStars } from "./sas";
import {
  alignedEpoch,
  displayRound,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  withChange,
} from "./schedule";
import { checkAuthenticatorData, webauthnChallenge } from "./signature";
import {
  encodeTicket,
  type Ticket,
  ticketBody,
  ticketContent,
  ticketId,
} from "./ticket";

/**
 * 공개 시험 값(docs/36 4절, 검증하기 페이지 `/stardraw/verify`).
 * 다른 언어로 검사기를 짜는 사람이 자기 구현을 맞춰 볼 수 있게, 규칙마다 고정 입력과 기대값을 둔다.
 * - `expected`는 손으로 적은 값이다. 여러 값은 다른 구현(파이썬 hashlib, noble, CT 참조 구현,
 *   Node createECDH, 실제 drand)과 따로 맞춰 봤다(각 규칙 시험 파일).
 * - `compute`는 이 패키지의 함수로 다시 계산한다. `vectors.test.ts`가 둘이 같은지 확인하고,
 *   페이지도 같은 `compute`를 브라우저에서 돌려 보여 주므로 문서와 코드가 어긋나지 않는다.
 */

export interface TestVector {
  title: string;
  /** 사람이 읽는 입력 설명 */
  input: string;
  expected: string;
  compute(): string | Promise<string>;
  /** 무거운 계산(Argon2 16MB 등). 페이지는 누를 때만 계산한다 */
  heavy?: boolean;
}

export interface VectorGroup {
  id: string;
  title: string;
  vectors: TestVector[];
}

const PUB = Uint8Array.from([4, ...new Array<number>(64).fill(1)]);
const PUB_TEXT = "04 ‖ 01 × 64";

/** 고정 응모권: v 1, 7회차, 번호 3 11 19 27 38 44, 공개 열쇠 04‖01×64, nonce 258, 원시 서명 0×64 */
const TICKET: Ticket = {
  v: 1,
  round: 7,
  numbers: [3, 11, 19, 27, 38, 44],
  pub: PUB,
  nonce: 258,
  sig: { kind: "raw", sig: new Uint8Array(64) },
};
const TICKET_TEXT = `v 1, 7회차, 번호 3·11·19·27·38·44, 공개 열쇠 ${PUB_TEXT}, nonce 258`;

const RAW_REG: KeyRegistration = {
  v: 1,
  kind: "raw",
  credentialId: new Uint8Array(),
  pub: PUB,
  nonce: 258,
};
const PASSKEY_REG: KeyRegistration = {
  v: 1,
  kind: "passkey",
  credentialId: fromHex("a1b2c3d4"),
  pub: PUB,
  nonce: 7,
};

/** Certificate Transparency 참조 구현의 RFC 6962 잎 */
const CT_LEAVES = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
].map(fromHex);

/** 1시간 회차, 2026-10-30 09:40 KST(1793322000) 뒤 첫 55분 마감이 1회차 마감 */
const HOURLY_EPOCH = alignedEpoch(1793322000, 3600);
const HOURLY: Schedule = {
  epoch: HOURLY_EPOCH,
  entries: [
    {
      fromRound: 1,
      length: 3600,
      closeMargin: 5,
      powTarget: 143165576,
      registerPowTarget: 7158278,
    },
  ],
};

/** 같은 일정표, 서버 장부처럼 시험 단계로 시작 */
const PHASED: Schedule = {
  epoch: HOURLY_EPOCH,
  entries: [{ ...(HOURLY.entries[0] as ScheduleEntry), phase: "trial" }],
};

/** drand quicknet 1000000회차(api.drand.sh에서 받은 실제 값) */
const BEACON = {
  round: 1000000,
  signature: fromHex(
    "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
  ),
};
const RANDOMNESS_HEX =
  "b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3";

/** 별 세 개용 고정 임시 열쇠(확인하는 분, 당첨자) */
const CHECKER_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "sHVzKqLT40R3lakwXpc8HmxWFriHIlZndES61L792NA",
  y: "g1P-2irX-leq-9FgYawlkQPPACqKRgAPnoTgRGXY8nI",
  d: "W2HREYn5QqLbS530wTeYrE3WasBEhHf3VZv0OvhPvLs",
};
const WINNER_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "5rjH91jSPQy_SI4SGyPhKPXHo_2R5PF3TEoRCYbxmi0",
  y: "haVR64a2KzzZypecwA0EAkRrkWE-bPgJwbx18Y9ODag",
  d: "DWMX58JwL5RewV6uABIfmz_0hxegpK41beXKUCzurWs",
};

async function sasKey(jwk: JsonWebKey) {
  const ecdh = { name: "ECDH", namedCurve: "P-256" };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, ecdh, true, [
    "deriveBits",
  ]);
  const { d: _d, ...pub } = jwk;
  const publicKey = await crypto.subtle.importKey("jwk", pub, ecdh, true, []);
  return sasKeyFromPair({ privateKey, publicKey });
}

async function sasSharedSecret(): Promise<Uint8Array> {
  const checker = await sasKey(CHECKER_JWK);
  const winner = await sasKey(WINNER_JWK);
  return sasSecret(checker.privateKey, winner.publicKey);
}

/** authenticatorData = SHA-256("game.byb.kr") ‖ flags ‖ signCount 1 */
function authData(flags: number): Uint8Array {
  return concat(
    sha256(utf8("game.byb.kr")),
    Uint8Array.from([flags, 0, 0, 0, 1]),
  );
}
const passOrReject = (flags: number) =>
  checkAuthenticatorData(authData(flags), "game.byb.kr") ? "통과" : "거절";

const DRAW = { numbers: [5, 29, 37, 38, 41, 45], bonus: 4 };

export const TEST_VECTORS: readonly VectorGroup[] = [
  {
    id: "hash",
    title: "해시",
    vectors: [
      {
        title: "SHA-256(FIPS 180-2)",
        input: '"abc"',
        expected:
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        compute: () => toHex(sha256(utf8("abc"))),
      },
    ],
  },
  {
    id: "ticket",
    title: "응모권",
    vectors: [
      {
        title: "작업 증명 대상(ticketContent)",
        input: TICKET_TEXT,
        expected: `0100000007030b131b262c04${"01".repeat(64)}`,
        compute: () => toHex(ticketContent(TICKET)),
      },
      {
        title: "서명 대상(ticketBody, 80바이트)",
        input: "위 ‖ nonce(u32)",
        expected: `0100000007030b131b262c04${"01".repeat(64)}00000102`,
        compute: () => toHex(ticketBody(TICKET)),
      },
      {
        title: '응모권 id = taggedHash("stardraw/ticket/v1", body)',
        input: "위 body",
        expected:
          "00319210354f9c7f5c03ed2a3ae21483b051a4595bbaef6fd7f2848d6091e321",
        compute: () => toHex(ticketId(TICKET)),
      },
      {
        title: "응모권 바이트(원시 서명)",
        input: "body ‖ 01 ‖ 서명 64바이트(여기서는 0)",
        expected: `0100000007030b131b262c04${"01".repeat(64)}0000010201${"00".repeat(64)}`,
        compute: () => toHex(encodeTicket(TICKET)),
      },
      {
        title: "패스키 challenge = base64url(SHA-256(서명할 내용))",
        input: '서명할 내용 = "stardraw/ticket-sig/v1" ‖ 00 ‖ body',
        expected: "ghOVND0T6gOq70dL44gDt6mFw9B5U4RIs_a9kEfbocU",
        compute: () =>
          toBase64Url(
            webauthnChallenge(
              concat(
                utf8("stardraw/ticket-sig/v1"),
                new Uint8Array([0]),
                ticketBody(TICKET),
              ),
            ),
          ),
      },
    ],
  },
  {
    id: "webauthn",
    title: "패스키 authenticatorData",
    vectors: [
      {
        title: "authenticatorData 바이트(flags 05)",
        input: 'SHA-256("game.byb.kr") ‖ flags 05(UP + UV) ‖ signCount 1(u32)',
        expected:
          "cbeb0bd2fd540b201a4aacf76ead7dbf18a929abe3ef560f2b7e8998e679144d0500000001",
        compute: () => toHex(authData(0x05)),
      },
      {
        title: "flags 검사: UP(01)·UV(04)가 모두 켜져야 통과",
        input: "flags 05 / 01 / 04 / 1d(동기화 패스키, BE·BS도 켜짐)",
        expected: "통과 / 거절 / 거절 / 통과",
        compute: () => [0x05, 0x01, 0x04, 0x1d].map(passOrReject).join(" / "),
      },
    ],
  },
  {
    id: "pow",
    title: "작업 증명(Argon2id)",
    vectors: [
      {
        title: "Argon2id(메모리 16MB, 반복 1, 병렬 1, 32바이트)",
        input:
          "salt = 11 × 32(문제 값), password = u16 길이 ‖ ticketContent ‖ nonce 0(u32)",
        expected:
          "4637c23e36292d161bb06239109a4f625297ddd5dc7366c1bd5e1ad55de9e8ec",
        compute: async () =>
          toHex(
            await powHash(
              fromHex("11".repeat(32)),
              ticketContent(TICKET),
              0,
              POW_PARAMS,
            ),
          ),
        heavy: true,
      },
    ],
  },
  {
    id: "registration",
    title: "열쇠 등록",
    vectors: [
      {
        title: "원시 열쇠 등록 바이트",
        input: `v 1, 종류 1, 패스키 번호 없음, 공개 열쇠 ${PUB_TEXT}, nonce 258`,
        expected: `01010000${toHex(PUB)}00000102`,
        compute: () => toHex(encodeRegistration(RAW_REG)),
      },
      {
        title: "패스키 등록 바이트",
        input: `v 1, 종류 2, 패스키 번호 a1b2c3d4, 공개 열쇠 ${PUB_TEXT}, nonce 7`,
        expected: `01020004a1b2c3d4${toHex(PUB)}00000007`,
        compute: () => toHex(encodeRegistration(PASSKEY_REG)),
      },
      {
        title: '등록 id = taggedHash("stardraw/registration/v1", 바이트)',
        input: "원시 열쇠 등록",
        expected:
          "724d74a20c1ad29833e1f7e2ccc0c137cd2213d7daff33d61f9f7779aa23decc",
        compute: () => toHex(registrationId(RAW_REG)),
      },
      {
        title: "등록 id",
        input: "패스키 등록",
        expected:
          "5521351b77817285c2b5997f2ca94c5f18121515180056077723e783773f162e",
        compute: () => toHex(registrationId(PASSKEY_REG)),
      },
    ],
  },
  {
    id: "merkle",
    title: "머클 루트(RFC 6962)",
    vectors: [
      {
        title: "빈 목록",
        input: "잎 0개",
        expected:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        compute: () => toHex(merkleRoot([])),
      },
      {
        title: "잎 1개",
        input: "(빈 바이트)",
        expected:
          "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
        compute: () => toHex(merkleRoot(CT_LEAVES.slice(0, 1))),
      },
      {
        title: "잎 3개",
        input: "(빈 바이트), 00, 10",
        expected:
          "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
        compute: () => toHex(merkleRoot(CT_LEAVES.slice(0, 3))),
      },
      {
        title: "잎 8개(CT 참조 구현)",
        input: "…, 40414243, 5051525354555657, 606162…6f",
        expected:
          "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
        compute: () => toHex(merkleRoot(CT_LEAVES)),
      },
    ],
  },
  {
    id: "schedule",
    title: "일정표와 drand 회차",
    vectors: [
      {
        title: "1시간 회차의 epoch(1회차가 열리는 시각)",
        input: "기준 시각 1793322000 뒤 첫 55분 마감이 1회차 마감",
        expected: "1793321700",
        compute: () => String(HOURLY_EPOCH),
      },
      {
        title: "1회차 마감(closesAt)",
        input: "epoch + 3600",
        expected: "1793325300",
        compute: () => String(roundTimes(HOURLY, 1).closesAt),
      },
      {
        title: "1회차가 쓰는 drand 회차",
        input: "마감 + 300초 이후 첫 quicknet 회차",
        expected: "33507412",
        compute: () =>
          String(drandRoundForClose(roundTimes(HOURLY, 1).closesAt)),
      },
      {
        title: "그 drand 회차의 시각",
        input: "1692803367 + (회차 − 1) × 3",
        expected: "1793325600",
        compute: () =>
          String(drandTime(drandRoundForClose(roundTimes(HOURLY, 1).closesAt))),
      },
      {
        title: "단계 없는 genesis 해시(연습 장부)",
        input:
          "위 일정표(마감 여유 5, 작업 증명 143165576, 등록 7158278, 단계 없음 0)",
        expected:
          "891b5b5f568b1e553bbe88f189a9262f50d52ff9f75675c630f5ed1101ba22d1",
        compute: () => toHex(genesisHash(HOURLY)),
      },
      {
        title: "단계가 있는 genesis 해시",
        input: '같은 일정표, 첫 줄 phase "trial"(단계 바이트 1)',
        expected:
          "34da4f32bdc737c526a2efeb8fe6439014b49547c755403d45c010b296c08c1d",
        compute: () => toHex(genesisHash(PHASED)),
      },
      {
        title: "보이는 회차 번호",
        input: '위 일정표 + 25회차부터 phase "live" 한 줄 → 24회차, 25회차',
        expected: "시험 24회 / 정식 1회",
        compute: () => {
          const s = withChange(PHASED, {
            ...(PHASED.entries[0] as ScheduleEntry),
            fromRound: 25,
            phase: "live",
          });
          return `${displayRound(s, 24).label} / ${displayRound(s, 25).label}`;
        },
      },
    ],
  },
  {
    id: "drand",
    title: "drand 서명과 난수",
    vectors: [
      {
        title: "quicknet BLS 서명 확인",
        input: "1000000회차, 서명 83ad29e4…be72",
        expected: "true",
        compute: () => String(verifyQuicknetBeacon(BEACON)),
      },
      {
        title: "난수 = SHA-256(서명)",
        input: "위 서명",
        expected: RANDOMNESS_HEX,
        compute: () => toHex(drandRandomness(BEACON)),
      },
    ],
  },
  {
    id: "draw",
    title: "당첨 번호와 등수",
    vectors: [
      {
        title: 'seed = taggedHash("stardraw/seed/v1", round(u32) ‖ 난수)',
        input: "1회차, 위 난수",
        expected:
          "7b7a451b60cccb19ef15e24b8880f62c7961ecce5ea34daf6e68bf82101a22f1",
        compute: () => toHex(drawSeed(1, fromHex(RANDOMNESS_HEX))),
      },
      {
        title: "나온 차례(앞 6개 당첨, 7번째 보너스)",
        input: "위 seed",
        expected: "45, 29, 5, 38, 37, 41, 4",
        compute: () =>
          drawNumbers(drawSeed(1, fromHex(RANDOMNESS_HEX))).order.join(", "),
      },
      {
        title: "등수",
        input: "당첨 5·29·37·38·41·45 + 보너스 4, 고른 번호 4·5·29·37·38·41",
        expected: "2",
        compute: () => String(rankOf(DRAW, [4, 5, 29, 37, 38, 41])),
      },
      {
        title: "등수",
        input: "같은 당첨, 고른 번호 1·2·3·5·29·37",
        expected: "5",
        compute: () => String(rankOf(DRAW, [1, 2, 3, 5, 29, 37])),
      },
    ],
  },
  {
    id: "seal",
    title: "봉인 값",
    vectors: [
      {
        title:
          'sealDigest = taggedHash("stardraw/seal/v1", round ‖ count ‖ merkleRoot ‖ registrationCount ‖ registrationRoot)',
        input: "1회차, 응모 0장(빈 루트), 등록 0개(빈 루트)",
        expected:
          "f239c191ce72c53bbe173db10b4f851f9f4efd72b5061f665f477e7053ad31de",
        compute: () => {
          const empty = merkleRoot([]);
          return toHex(
            sealDigest({
              round: 1,
              count: 0,
              merkleRoot: empty,
              registrationCount: 0,
              registrationRoot: empty,
            }),
          );
        },
      },
    ],
  },
  {
    id: "sas",
    title: "별 세 개(ECDH)",
    vectors: [
      {
        title: "공유 비밀(P-256 ECDH, 32바이트)",
        input: "고정 임시 열쇠 두 개(JWK, vectors.ts)",
        expected:
          "2b2ee18355c88af67a4e461574d24558b464f2bb199debc79716cf698b7c21cf",
        compute: async () => toHex(await sasSharedSecret()),
      },
      {
        title: "별 세 개(차례 있음)",
        input: '위 비밀, 요청 id "req-1"',
        expected: "16, 31, 1",
        compute: async () =>
          sasStars(await sasSharedSecret(), "req-1").join(", "),
      },
      {
        title: "별 세 개",
        input: '같은 비밀, 요청 id "req-2"',
        expected: "27, 11, 10",
        compute: async () =>
          sasStars(await sasSharedSecret(), "req-2").join(", "),
      },
    ],
  },
];
