import { createTopicStrategy } from "@trystero-p2p/core";

import { diag } from "./diag";

/**
 * 서로를 찾는 신호를 넘기는 우리 서버(servers 저장소 `byb.kr/apps/mighty-signal`).
 * 공개 Nostr 릴레이는 해외라 연결에만 1~6초가 걸려 이것으로 바꿨다(docs/06 "방 들어가기 지연").
 * 개발 서버(localhost)에서도 실제 방을 시험할 수 있게 절대 주소로 둔다. 서버가 localhost 출처를 받는다.
 */
const SIGNAL_URL =
  process.env.NEXT_PUBLIC_SIGNAL_URL ?? "https://game.byb.kr/signal";
/** 구독이 열리기를 기다리는 최대 시간. 넘으면 열리지 않은 채로 진행하고, 알리기를 되풀이하며 만난다 */
const OPEN_TIMEOUT_MS = 5000;
/**
 * 같은 서버를 통로 몇 개로 쓸지. trystero는 통로마다 따로 연결을 시도해서, 통로가 하나면 첫 시도의
 * 경로 찾기(ICE)가 실패할 때 다시 시도하기까지 23~57초를 기다린다. Nostr 릴레이 다섯 곳을 쓸 때는
 * 시도가 다섯이라 이것이 가려졌다. 화면 시험에서 브라우저 넷을 함께 띄워 보면 하나는 자주, 둘은 가끔
 * 실패했고 셋은 늘 이어졌다. 메시지가 세 배가 되지만 몇 KB라 괜찮다.
 */
const LANES = 3;

type Relay = {
  base: string;
  lane: number;
  /** 아직 열리는 중인 구독. 알리기 전에 기다려야 상대의 답(내 주제로 오는 연결 정보)을 놓치지 않는다 */
  opening: Set<Promise<void>>;
  started: number;
};

/**
 * trystero의 신호 방식. 주제(방 코드에서 만든 해시)마다 SSE로 구독하고, 올리기는 POST 한 번이다.
 * 오가는 내용은 trystero가 방 코드로 암호화한 연결 정보라 서버는 읽지 못한다.
 */
export const joinRoom = createTopicStrategy<Relay>({
  init: () =>
    Array.from({ length: LANES }, (_, lane) => ({
      base: SIGNAL_URL,
      lane,
      opening: new Set<Promise<void>>(),
      started: performance.now(),
    })),
  subscribeTopic: (relay, topic, onMessage, { kind }) => {
    // 서비스 워커나 중간 캐시가 예전 응답을 돌려주지 않게 요청마다 주소를 다르게 한다.
    const source = new EventSource(
      `${relay.base}/sub?t=${topic}&n=${Math.random().toString(36).slice(2)}`,
    );
    source.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof message === "string" || isRecord(message))
        void onMessage(topic, message);
    };
    const opened = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        diag("signal", { topic: kind, lane: relay.lane, ok: false });
        resolve();
      }, OPEN_TIMEOUT_MS);
      source.onopen = () => {
        clearTimeout(timer);
        source.onopen = null;
        diag("signal", {
          topic: kind,
          lane: relay.lane,
          ok: true,
          ms: Math.round(performance.now() - relay.started),
        });
        resolve();
      };
    });
    relay.opening.add(opened);
    return opened.then(() => {
      relay.opening.delete(opened);
      return () => source.close();
    });
  },
  publishTopic: async (relay, topic, message) => {
    await Promise.all(relay.opening);
    await enqueue(relay.base, topic, message);
  },
});

/** 같은 순간의 메시지를 모으는 시간. 통로 셋이 같은 메시지를 함께 올리고 경로 후보도 몰려 나온다 */
const BATCH_MS = 15;
/** 서버가 묶음 하나에 받는 한도(64개·64KB)보다 조금 작게 */
const BATCH_MAX = 64;
const BATCH_MAX_CHARS = 48 * 1024;

let pending: { t: string; m: unknown }[] = [];
let flushing: Promise<void> | null = null;

/**
 * 메시지를 모아 POST 한 번으로 보낸다. 하나씩 보내면 다섯 명이 들어올 때 1초에 200번 가까이 몰려
 * 서버의 IP당 횟수 제한(회사 와이파이는 모두 같은 IP)에 걸렸다.
 */
function enqueue(base: string, topic: string, message: unknown) {
  pending.push({ t: topic, m: message });
  flushing ??= new Promise<void>((resolve) => {
    setTimeout(async () => {
      const batch = pending;
      pending = [];
      flushing = null;
      // 본문을 글자로 보내면 단순 요청이라 다른 출처(개발 서버)에서도 사전 확인 요청 없이 간다.
      for (const body of chunks(batch))
        await fetch(`${base}/pub`, { method: "POST", body }).catch(
          () => undefined,
        );
      resolve();
    }, BATCH_MS);
  });
  return flushing;
}

function chunks(batch: { t: string; m: unknown }[]): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const item of batch) {
    const text = JSON.stringify(item);
    if (
      current.length > 0 &&
      (current.length >= BATCH_MAX || size + text.length > BATCH_MAX_CHARS)
    ) {
      out.push(`[${current.join(",")}]`);
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length + 1;
  }
  if (current.length > 0) out.push(`[${current.join(",")}]`);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
