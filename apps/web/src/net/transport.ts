/**
 * 기기 사이 통신 창구. 대국 코드는 이것만 알고, 실제로 무엇으로 연결되는지(WebRTC, 같은 브라우저 안 채널,
 * 테스트용 메모리)는 모른다. 나중에 BLE를 붙일 때도 이 인터페이스를 구현한다.
 */
export interface Transport {
  /** 이 기기의 아이디. 방 안에서 겹치지 않는다 */
  readonly selfId: string;
  /** `to`가 없으면 방 안 모두에게 */
  send(message: unknown, to?: string): void;
  onMessage(handler: (message: unknown, from: string) => void): void;
  onPeerJoin(handler: (peerId: string) => void): void;
  onPeerLeave(handler: (peerId: string) => void): void;
  leave(): void;
  /**
   * 그 상대와의 연결을 암호화하는 인증서(DTLS)의 지문. 내 것과 상대 것.
   * 신호 릴레이가 연결 정보를 바꿔치기해 가운데 끼면 상대 지문이 진짜 상대의 것과 달라진다(identity.ts).
   * WebRTC가 아닌 연결(같은 브라우저 탭)은 없다. 연결이 아직이면 null
   */
  fingerprints?(peerId: string): Promise<ConnectionFingerprints | null>;
}

export interface ConnectionFingerprints {
  local: string;
  remote: string;
}

/** SDP의 인증서 지문(`a=fingerprint:sha-256 AB:CD:…`). 여러 줄이면 첫 줄(한 연결은 인증서 하나다) */
export function sdpFingerprint(sdp: string | undefined): string | null {
  const match = sdp?.match(/^a=fingerprint:(\S+) ([0-9A-Fa-f:]+)\s*$/m);
  return match
    ? `${(match[1] as string).toLowerCase()} ${(match[2] as string).toUpperCase()}`
    : null;
}

/**
 * 연결의 인증서 지문. 메시지는 오가는데 연결 정보가 아직 다 붙지 않았을 수 있어 잠깐(3초) 다시 본다.
 * WebRTC가 아니면 바로 null
 */
export async function connectionFingerprints(
  transport: Transport,
  peerId: string,
): Promise<ConnectionFingerprints | null> {
  if (!transport.fingerprints) return null;
  for (let i = 0; i < 30; i++) {
    const found = await transport.fingerprints(peerId);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export function randomId(length = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

type Handlers = {
  message: ((message: unknown, from: string) => void)[];
  join: ((peerId: string) => void)[];
  leave: ((peerId: string) => void)[];
};

function emptyHandlers(): Handlers {
  return { message: [], join: [], leave: [] };
}

/** 테스트용: 같은 프로세스 안의 여러 참가자를 메모리로 잇는다. 메시지는 비동기로 전달한다(실제 네트워크처럼) */
export class MemoryNetwork {
  private readonly peers = new Map<string, Handlers>();
  /** 시험: WebRTC처럼 연결마다 인증서 지문을 준다(`fingerprints`) */
  dtls = false;
  /** 시험: `a`가 보는 `b`의 인증서를 바꾼다(신호 릴레이가 가운데 낀 것) */
  private readonly forged = new Map<string, string>();

  intercept(a: string, b: string): void {
    this.forged.set(`${a}>${b}`, `sha-256 CERT-OF-RELAY-${b}`);
  }
  /** 연결이 잠시 끊긴 참가자. 메시지가 오가지 않는다 */
  private readonly down = new Set<string>();

  /** 연결이 잠깐 끊긴 것처럼 서로에게 나갔다고 알린다(처리기는 그대로 둔다) */
  disconnect(id: string): void {
    const self = this.peers.get(id);
    if (!self || this.down.has(id)) return;
    this.down.add(id);
    for (const [otherId, other] of this.peers) {
      if (otherId === id) continue;
      queueMicrotask(() => {
        for (const h of other.leave) h(id);
        for (const h of self.leave) h(otherId);
      });
    }
  }

  /** 끊겼던 참가자가 다시 보인다 */
  reconnect(id: string): void {
    const self = this.peers.get(id);
    if (!self || !this.down.delete(id)) return;
    for (const [otherId, other] of this.peers) {
      if (otherId === id || this.down.has(otherId)) continue;
      queueMicrotask(() => {
        for (const h of other.join) h(id);
        for (const h of self.join) h(otherId);
      });
    }
  }

  join(selfId = randomId()): Transport {
    const handlers = emptyHandlers();
    const deliver = (fn: () => void) => queueMicrotask(fn);
    for (const [id, other] of this.peers) {
      deliver(() => {
        for (const h of other.join) h(selfId);
        for (const h of handlers.join) h(id);
      });
    }
    this.peers.set(selfId, handlers);
    return {
      selfId,
      send: (message, to) => {
        // 실제 네트워크처럼 받는 쪽이 고쳐 쓰지 못하게 복사해서 보낸다.
        const copy = JSON.parse(JSON.stringify(message)) as unknown;
        if (this.down.has(selfId)) return;
        for (const [id, other] of this.peers) {
          if (id === selfId || (to !== undefined && id !== to)) continue;
          if (this.down.has(id)) continue;
          deliver(() => {
            for (const h of other.message) h(copy, selfId);
          });
        }
      },
      onMessage: (h) => handlers.message.push(h),
      onPeerJoin: (h) => handlers.join.push(h),
      onPeerLeave: (h) => handlers.leave.push(h),
      ...(this.dtls
        ? {
            fingerprints: async (peerId: string) =>
              this.peers.has(peerId)
                ? {
                    local: `sha-256 CERT-OF-${selfId}`,
                    remote:
                      this.forged.get(`${selfId}>${peerId}`) ??
                      `sha-256 CERT-OF-${peerId}`,
                  }
                : null,
          }
        : {}),
      leave: () => {
        this.peers.delete(selfId);
        for (const other of this.peers.values()) {
          deliver(() => {
            for (const h of other.leave) h(selfId);
          });
        }
      },
    };
  }
}

/**
 * 같은 브라우저의 탭끼리 BroadcastChannel로 잇는다. 인터넷 없이 여러 탭으로 대전을 시험하거나
 * 화면 테스트에서 쓴다. 주소에 `?net=local`을 붙이면 이것을 쓴다.
 */
export function joinBroadcast(roomId: string): Transport {
  const selfId = randomId();
  const channel = new BroadcastChannel(`mighty-room-${roomId}`);
  const handlers = emptyHandlers();
  const known = new Set<string>();
  type Wire =
    | { kind: "hello"; from: string; reply: boolean }
    | { kind: "bye"; from: string }
    | { kind: "msg"; from: string; to?: string; message: unknown };

  const post = (wire: Wire) => channel.postMessage(wire);
  channel.onmessage = (event: MessageEvent<Wire>) => {
    const wire = event.data;
    if (wire.from === selfId) return;
    if (wire.kind === "hello") {
      if (!known.has(wire.from)) {
        known.add(wire.from);
        for (const h of handlers.join) h(wire.from);
      }
      if (!wire.reply) post({ kind: "hello", from: selfId, reply: true });
    } else if (wire.kind === "bye") {
      known.delete(wire.from);
      for (const h of handlers.leave) h(wire.from);
    } else if (wire.to === undefined || wire.to === selfId) {
      for (const h of handlers.message) h(wire.message, wire.from);
    }
  };
  // 이미 있는 탭이 알아채도록 인사한다. 처리기를 붙일 시간을 준다.
  setTimeout(() => post({ kind: "hello", from: selfId, reply: false }), 0);
  const bye = () => post({ kind: "bye", from: selfId });
  window.addEventListener("pagehide", bye);

  return {
    selfId,
    send: (message, to) =>
      post({ kind: "msg", from: selfId, ...(to ? { to } : {}), message }),
    onMessage: (h) => handlers.message.push(h),
    onPeerJoin: (h) => handlers.join.push(h),
    onPeerLeave: (h) => handlers.leave.push(h),
    leave: () => {
      bye();
      window.removeEventListener("pagehide", bye);
      channel.close();
    },
  };
}
