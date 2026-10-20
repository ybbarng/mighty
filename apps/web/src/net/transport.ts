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
