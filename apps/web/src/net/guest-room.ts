import {
  type Action,
  decodeRuleString,
  type LoggedAction,
  type PlayerView,
  replay,
  viewOf,
} from "@mighty/engine";

import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";

import { commit, deriveSeed, newSecret } from "./fairness";
import {
  type ChatMessage,
  type Commitment,
  type GuestMessage,
  type HostMessage,
  isHostMessage,
  type LobbyState,
  type Reveal,
} from "./protocol";
import type { Transport } from "./transport";

export type AuditResult = { ok: true } | { ok: false; reason: string };

/** 참가자 화면이 아는 대국. 행동은 방장에게 보내고, 방장이 보낸 스냅숏을 받는다 */
export class RemoteMatch implements MatchHost {
  private last: PlayerView;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private readonly pending: Snapshot[] = [];

  constructor(
    readonly seat: number,
    first: Snapshot,
    private readonly sendAction: (action: Action) => void,
  ) {
    this.last = first.view;
    this.pending.push(first);
  }

  current(): PlayerView {
    return this.last;
  }

  drain(): Snapshot[] {
    return this.pending.splice(0);
  }

  /** 결과는 방장 엔진이 정한다. 거절되면 `rejected` 메시지로 알려 온다 */
  submit(action: Action): SubmitResult {
    if (this.last.decision === null)
      return { ok: false, error: "지금은 차례가 아니다" };
    this.sendAction(action);
    return { ok: true };
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  receive(snapshot: Snapshot): void {
    this.last = snapshot.view;
    if (this.listeners.size === 0) this.pending.push(snapshot);
    for (const l of this.listeners) l(snapshot);
  }
}

export interface GuestRoomOptions {
  transport: Transport;
  name: string;
  /** 재접속용. 같은 방에 다시 들어올 때 같은 자리를 받는다 */
  token: string | null;
  /** 재접속할 때 처음 약속한 비밀 값을 그대로 쓴다 */
  secret?: string;
}

/**
 * 참가자 기기의 방. 방장을 찾아 들어가고, 대기실 정보와 대국 스냅숏을 받는다.
 * 게임이 끝나면 방장이 공개한 비밀 값과 기록으로 시드와 진행을 직접 다시 계산해 확인한다.
 */
export class GuestRoom {
  readonly transport: Transport;
  readonly secret: string;
  seat: number | null = null;
  token: string | null;
  lobby: LobbyState | null = null;
  match: RemoteMatch | null = null;
  private hostId: string | null = null;
  private commitments: Commitment[] = [];
  private readonly name: string;
  private commitHash: Promise<string>;
  /** 방장이 내보냈으면 그 뒤 메시지는 받지 않는다 */
  private kicked = false;
  private readonly listeners = {
    lobby: new Set<(lobby: LobbyState) => void>(),
    seat: new Set<(seat: number, token: string) => void>(),
    match: new Set<(match: RemoteMatch) => void>(),
    rejected: new Set<(error: string) => void>(),
    full: new Set<() => void>(),
    kicked: new Set<() => void>(),
    chat: new Set<(message: ChatMessage) => void>(),
    hostLeft: new Set<() => void>(),
    audit: new Set<(result: AuditResult) => void>(),
  };

  constructor(options: GuestRoomOptions) {
    this.transport = options.transport;
    this.name = options.name;
    this.token = options.token;
    this.secret = options.secret ?? newSecret();
    this.commitHash = commit(this.secret);

    this.transport.onPeerJoin((peerId) => {
      // 누가 방장인지 모르므로 새로 보이는 상대에게 들어가겠다고 알린다. 방장만 답한다.
      if (this.seat === null || this.hostId === peerId)
        void this.sendJoin(peerId);
    });
    this.transport.onPeerLeave((peerId) => {
      if (peerId !== this.hostId) return;
      this.hostId = null;
      for (const l of this.listeners.hostLeft) l();
    });
    this.transport.onMessage((message, from) => {
      if (isHostMessage(message)) void this.onMessage(message, from);
    });
  }

  on<K extends keyof GuestRoom["listeners"]>(
    event: K,
    listener: GuestRoom["listeners"][K] extends Set<infer L> ? L : never,
  ): () => void {
    const set = this.listeners[event] as Set<typeof listener>;
    set.add(listener);
    return () => set.delete(listener);
  }

  /** 말한다. 방장이 이름을 붙여 모두에게 다시 보낸다 */
  chat(text: string): void {
    if (this.hostId) this.send({ t: "chat", text }, this.hostId);
  }

  leave(): void {
    if (this.hostId) this.send({ t: "leave" }, this.hostId);
    this.transport.leave();
  }

  private async sendJoin(peerId: string): Promise<void> {
    this.send(
      {
        t: "join",
        name: this.name,
        token: this.token,
        commit: await this.commitHash,
      },
      peerId,
    );
  }

  private send(message: GuestMessage, to: string): void {
    this.transport.send(message, to);
  }

  private async onMessage(message: HostMessage, from: string): Promise<void> {
    if (this.kicked) return;
    switch (message.t) {
      case "welcome":
        this.hostId = from;
        this.seat = message.seat;
        this.token = message.token;
        for (const l of this.listeners.seat) l(message.seat, message.token);
        break;
      case "full":
        for (const l of this.listeners.full) l();
        break;
      case "kicked":
        if (this.hostId !== null && from !== this.hostId) return;
        this.kicked = true;
        this.transport.leave();
        for (const l of this.listeners.kicked) l();
        break;
      case "lobby":
        if (this.hostId !== null && from !== this.hostId) return;
        this.lobby = message.lobby;
        for (const l of this.listeners.lobby) l(message.lobby);
        break;
      case "started":
        if (from !== this.hostId) return;
        this.commitments = message.commitments;
        // 방장 것까지 모든 약속을 받은 뒤에야 비밀 값을 방장에게만 보낸다.
        this.send({ t: "reveal", secret: this.secret }, from);
        break;
      case "snapshot": {
        if (from !== this.hostId || this.seat === null) return;
        const snapshot = { view: message.view, events: message.events };
        if (this.match) {
          this.match.receive(snapshot);
        } else {
          this.match = new RemoteMatch(this.seat, snapshot, (action) => {
            if (this.hostId) this.send({ t: "action", action }, this.hostId);
          });
          for (const l of this.listeners.match) l(this.match);
        }
        break;
      }
      case "chat":
        if (from !== this.hostId) return;
        for (const l of this.listeners.chat) l(message.message);
        break;
      case "rejected":
        for (const l of this.listeners.rejected) l(message.error);
        break;
      case "audit": {
        if (from !== this.hostId) return;
        const result = await this.verify(message.reveals, message.log);
        for (const l of this.listeners.audit) l(result);
        break;
      }
    }
  }

  /** 방장이 공개한 값으로 시드와 진행을 다시 계산해 내가 본 것과 맞춰 본다 */
  private async verify(
    reveals: Reveal[],
    log: LoggedAction[],
  ): Promise<AuditResult> {
    if (this.seat === null || !this.lobby || !this.match)
      return { ok: false, reason: "대국 정보가 없다" };
    const mine = reveals.find((r) => r.seat === this.seat);
    if (
      this.commitments.some((c) => c.seat === this.seat) &&
      mine?.secret !== this.secret
    ) {
      return { ok: false, reason: "방장이 내 비밀 값을 바꿨다" };
    }
    const seed = await deriveSeed(this.commitments, reveals);
    if (!seed.ok) return seed;
    const rules = decodeRuleString(this.lobby.ruleCode);
    if (!rules.ok) return { ok: false, reason: rules.reason };
    const replayed = replay({ rules: rules.rules, seed: seed.seed }, log);
    if (!replayed.ok)
      return {
        ok: false,
        reason: `기록 ${replayed.index + 1}번째 행동이 규칙에 맞지 않는다`,
      };
    const expected = viewOf(replayed.state, this.seat);
    if (JSON.stringify(expected) !== JSON.stringify(this.match.current())) {
      return { ok: false, reason: "다시 계산한 결과가 내가 본 화면과 다르다" };
    }
    return { ok: true };
  }
}
