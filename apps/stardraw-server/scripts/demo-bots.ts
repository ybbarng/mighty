/**
 * 로컬 데모 전용(운영에 쓰지 않는다): 회차 방에 가짜 우주인 몇 명을 들여 말하고 응원하게 한다.
 * 로컬 서버에 등록하고(작업 증명), 열린 회차에 응모한 뒤, 방에 들어가 가끔 말하고 응원한다.
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c scripts/rolldown.demo.mjs
 * 실행: node dist/demo-bots.mjs <서버 주소, 예: http://localhost:8790/stardraw-api> <사이트 origin> [사람 수]
 */
import {
  encodeRegistration,
  encodeRegistrationProof,
  encodeSignatureData,
  encodeTicket,
  fromHex,
  generateSigner,
  makeRegistration,
  makeTicket,
  POW_PARAMS,
  powTargetForTries,
  roomPassMessage,
  type SoftPasskey,
  signRegistrationProof,
  softPasskeySigner,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";

const [
  base = "http://localhost:8790/stardraw-api",
  origin = "http://localhost:3470",
  countArg = "6",
] = process.argv.slice(2);
const COUNT = Number(countArg);
const policy = { rpId: new URL(origin).hostname, origins: [origin] };

const LINES = [
  "오늘은 시리우스가 올 것 같아요",
  "베텔게우스 제발!",
  "다들 몇 번 고르셨어요?",
  "두근두근",
  "이번엔 느낌이 좋아요",
  "카운트다운 시작했다",
  "별똥별 보냅니다",
  "북극성은 늘 제자리네요",
  "와 방금 그 별 제 거예요",
  "다음 회차도 와야지",
  "커피 한 잔의 꿈",
  "하늘이 정한다니 믿어 봅니다",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)] as T;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`);
  return data;
}

async function state() {
  const res = await fetch(`${base}/api/state`);
  return (await res.json()) as {
    round: number;
    head: string;
    now: number;
    behind: number;
  };
}

function randomNumbers(): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const out: number[] = [];
  for (let i = 0; i < 6; i++)
    out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  return out.sort((a, b) => a - b);
}

async function register(signer: SoftPasskey) {
  // 앞 회차가 닫혀 문제 값이 정해진 뒤에만 작업 증명을 푼다(헛계산을 막는다)
  let s = await state();
  while (s.behind !== 0) {
    await sleep(5000);
    s = await state();
  }
  const head = fromHex(s.head);
  const registration = await makeRegistration(
    signer,
    signer.credentialId,
    head,
    powTargetForTries(600),
    {
      params: POW_PARAMS,
    },
  );
  if (!registration) throw new Error("등록을 만들지 못했다");
  const proof = await signRegistrationProof(signer, registration);
  await post("/api/register", {
    registration: toBase64Url(encodeRegistration(registration)),
    proof: toBase64Url(encodeRegistrationProof(proof)),
    head: toHex(head),
  });
}

async function enter(signer: SoftPasskey, round: number) {
  const s = await state();
  if (s.round !== round) return;
  const ticket = await makeTicket(
    signer,
    round,
    randomNumbers(),
    fromHex(s.head),
    powTargetForTries(30),
    {
      params: POW_PARAMS,
    },
  );
  if (!ticket) return;
  await post("/api/enter", { ticket: toBase64Url(encodeTicket(ticket)) }).catch(
    (e) => console.log(`[bot] 응모 못함: ${e.message}`),
  );
}

/** 한 회차 방에 머문다: 표를 받고 스트림을 열어 둔 채 가끔 말하고 응원한다 */
async function stay(signer: SoftPasskey, name: string, round: number) {
  const { nonce } = await post<{ nonce: string }>(
    `/api/room/${round}/challenge`,
    {},
  );
  const signature = await signer.sign(
    roomPassMessage(round, Buffer.from(nonce, "base64url")),
  );
  const { pass } = await post<{ pass: string }>(`/api/room/${round}/pass`, {
    pub: toBase64Url(signer.publicKey),
    signature: encodeSignatureData(signature),
    nonce,
  });
  const abort = new AbortController();
  const stream = await fetch(`${base}/api/room/${round}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pass }),
    signal: abort.signal,
  });
  let open = stream.ok;
  void (async () => {
    const reader = stream.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader
        .read()
        .catch(() => ({ done: true, value: undefined }));
      if (done) break;
      if (decoder.decode(value).includes('"type":"closed"')) break;
    }
    open = false;
  })();
  console.log(`[bot] ${name} 방 ${round}에 들어감`);
  while (open) {
    await sleep(12_000 + Math.random() * 18_000);
    if (!open) break;
    const roll = Math.random();
    if (roll < 0.55)
      await post(`/api/room/${round}/say`, { pass, text: pick(LINES) }).catch(
        () => {},
      );
    else
      await post(`/api/room/${round}/cheer`, {
        pass,
        kind: roll < 0.8 ? "meteor" : "twinkle",
        to: null,
      }).catch(() => {});
  }
  abort.abort();
}

async function bot(i: number) {
  const signer = softPasskeySigner(await generateSigner(), { policy });
  const name = `봇${i + 1}`;
  await sleep(i * 1500);
  for (;;) {
    try {
      await register(signer);
      break;
    } catch (e) {
      console.log(`[bot] ${name} 등록 다시: ${(e as Error).message}`);
      await sleep(20_000);
    }
  }
  console.log(`[bot] ${name} 등록함`);
  // 응모는 따로: 응모를 받는 동안(앞 회차 추첨이 끝난 뒤) 회차마다 한 장씩 낸다. 그래야 추첨 때 얼굴이 빛난다
  void (async () => {
    let entered = 0;
    for (;;) {
      const s = await state().catch(() => null);
      if (s && s.behind === 0 && s.round !== entered) {
        await enter(signer, s.round).catch(() => {});
        entered = s.round;
      }
      await sleep(20_000 + Math.random() * 10_000);
    }
  })();
  for (;;) {
    const s = await state();
    // 마감했지만 아직 추첨하지 않은 회차가 있으면 그 방(다음 추첨)으로, 아니면 지금 응모받는 회차 방으로
    const round = s.behind > 0 ? s.round - 1 : s.round;
    try {
      await stay(signer, name, round);
    } catch (e) {
      console.log(`[bot] ${name} 방 ${round}: ${(e as Error).message}`);
      await sleep(10_000);
    }
  }
}

console.log(`[bot] ${COUNT}명, 서버 ${base}`);
await Promise.all(Array.from({ length: COUNT }, (_, i) => bot(i)));
