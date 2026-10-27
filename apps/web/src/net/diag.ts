/**
 * 연결 진단 기록. 인터넷 대전에서 연결·나눠 주기에 걸린 시간을 생기는 즉시 서버(`/diag`)로 보낸다.
 * 게임 연결(WebRTC)이 막혀도 일반 HTTPS로 가므로, 이어지지 않는 경우도 남는다.
 * 게임 내용(패·이름·채팅)과 방 코드 원문은 보내지 않는다(방은 해시 앞부분만).
 * 인터넷 대전에서 `startDiag`를 부르기 전에는 아무것도 하지 않는다(단위 시험, 같은 탭 시험).
 */

import type { FairDevice } from "@mighty/fair-play";

const ENDPOINT = "/diag";
/** 이만큼 모아서 한 번에 보낸다(ms). 서버는 같은 공인 IP당 1분 60번까지 받는다 */
const FLUSH_MS = 5000;
/** 한 번에 보내는 최대 이벤트 수(서버는 16KB 넘는 본문을 거절한다) */
const MAX_BATCH = 20;

export interface DiagContext {
  role: "host" | "guest";
  game: string;
}

interface Session {
  id: string;
  room: string;
  started: number;
}

type DiagEvent = Record<string, unknown> & { kind: string };

let session: Session | null = null;
const queue: DiagEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

/** 방 코드의 SHA-256 앞 12자리. 같은 방의 기기 기록을 잇는 데만 쓴다 */
async function roomTag(roomId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(roomId),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function device(): Record<string, unknown> {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
    userAgentData?: { mobile?: boolean; platform?: string };
  };
  return {
    ua: nav.userAgent,
    mobile:
      nav.userAgentData?.mobile ?? /Mobi|Android|iPhone/.test(nav.userAgent),
    cores: nav.hardwareConcurrency,
    net: nav.connection?.effectiveType ?? null,
    netType: nav.connection?.type ?? null,
  };
}

/** 인터넷 대전에 들어갈 때 부른다. 같은 페이지에서 다시 들어가면 새 기록으로 시작한다 */
export async function startDiag(
  roomId: string,
  context: DiagContext,
): Promise<void> {
  flush();
  session = {
    id: crypto.randomUUID(),
    room: await roomTag(roomId),
    started: performance.now(),
  };
  if (!listening) {
    listening = true;
    // 창을 닫거나 앱을 내려도 남은 기록을 보낸다.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
    window.addEventListener("pagehide", () => flush(true));
  }
  diag("hello", { ...context, ...device() });
}

/** 기록 하나. `t`는 방에 들어가기 시작한 뒤 지난 시간(ms) */
export function diag(kind: string, data: Record<string, unknown> = {}): void {
  if (!session) return;
  queue.push({
    s: session.id,
    room: session.room,
    at: new Date().toISOString(),
    t: Math.round(performance.now() - session.started),
    kind,
    ...data,
  });
  if (queue.length >= MAX_BATCH) flush();
  else if (timer === null) timer = setTimeout(() => flush(), FLUSH_MS);
}

function flush(beacon = false): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length > 0) {
    const body = JSON.stringify(queue.splice(0, MAX_BATCH));
    if (beacon && navigator.sendBeacon?.(ENDPOINT, body)) continue;
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {
      // 진단 기록은 못 보내도 게임에는 영향이 없다.
    });
  }
}

/** 멘탈 포커 기기의 시간 재기: 새 판 시작, 무거운 계산에 걸린 시간, 내 카드가 열린 때 */
export function watchFairDevice(device: FairDevice): void {
  device.on("timing", (deal, what, ms, stage) =>
    diag("fair", { deal, what, ms: Math.round(ms), stage: stage ?? null }),
  );
  device.on("cards", (deal, cards) => diag("cards", { deal, n: cards.size }));
}
