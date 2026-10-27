import { diag } from "./diag";

/** 아직 아무와도 못 이었을 때 연결 시도 상황을 보내는 때(방에 들어간 뒤 ms) */
const WAITING_REPORTS_MS = [15_000, 30_000, 60_000, 120_000];

/** 연결 하나의 지금 상황: 후보 종류, 확인 신호를 보내고 받은 수, 이어졌으면 그 길 */
async function summarize(
  pc: RTCPeerConnection,
): Promise<Record<string, unknown>> {
  const stats = [...(await pc.getStats()).values()] as (RTCStats &
    Record<string, unknown>)[];
  const byId = new Map(stats.map((s) => [s.id, s]));
  const types = (kind: string) =>
    stats
      .filter((s) => s.type === kind)
      .map((s) => `${s.candidateType}/${s.protocol}`)
      .sort();
  const pairs = stats.filter((s) => s.type === "candidate-pair");
  const sum = (key: string) =>
    pairs.reduce((n, p) => n + (Number(p[key]) || 0), 0);
  const chosen = pairs.find((p) => p.nominated && p.state === "succeeded");
  const local = chosen && byId.get(chosen.localCandidateId as string);
  const remote = chosen && byId.get(chosen.remoteCandidateId as string);
  return {
    state: pc.connectionState,
    ice: pc.iceConnectionState,
    local: types("local-candidate"),
    remote: types("remote-candidate"),
    pairs: pairs.map((p) => p.state).sort(),
    requestsSent: sum("requestsSent"),
    responsesReceived: sum("responsesReceived"),
    requestsReceived: sum("requestsReceived"),
    ...(chosen
      ? {
          path: `${local?.candidateType}-${remote?.candidateType}`,
          relayProtocol: local?.relayProtocol ?? null,
          rttMs:
            typeof chosen.currentRoundTripTime === "number"
              ? Math.round(chosen.currentRoundTripTime * 1000)
              : null,
        }
      : {}),
  };
}

/**
 * 연결 진단을 붙인 RTCPeerConnection(trystero의 `rtcPolyfill`로 넘긴다).
 * 연결 시도마다 상태가 바뀔 때 기록하고, 이어지면 어떤 길(직접·바깥 주소·중계)로 이어졌는지 남긴다.
 */
export function trackedPeerConnections(): {
  Tracked: typeof RTCPeerConnection;
  /** 아직 아무와도 못 이었으면 정해진 때마다 연결 시도 상황을 보낸다. 멈출 함수를 돌려준다 */
  watchWaiting(connected: () => boolean): () => void;
} {
  const live = new Set<RTCPeerConnection>();
  let count = 0;

  class Tracked extends RTCPeerConnection {
    constructor(config?: RTCConfiguration) {
      super(config);
      const pc = count++;
      live.add(this);
      diag("pc", { pc, state: "new" });
      this.addEventListener("connectionstatechange", () => {
        const state = this.connectionState;
        if (state === "connected")
          void summarize(this).then((s) => diag("pc", { pc, ...s }));
        else diag("pc", { pc, state });
        if (state === "closed" || state === "failed") live.delete(this);
      });
    }
  }

  const watchWaiting = (connected: () => boolean) => {
    const timers = WAITING_REPORTS_MS.map((ms) =>
      setTimeout(() => {
        if (connected()) return;
        void Promise.all([...live].map(summarize)).then((pcs) =>
          diag("waiting", { afterMs: ms, pcs }),
        );
      }, ms),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  };

  return { Tracked, watchWaiting };
}
