import type {
  Action,
  GameEvent,
  MatchState,
  PlayerView,
  PresetDeal,
  RuleSet,
} from "@mighty/engine";

import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import type { GameKit, KitLoggedAction } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";

import { commit, deriveSeed, newSecret } from "./fairness";
import { verifyHostProof, welcomeStatement } from "./identity";
import {
  type AuditReport,
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
export class RemoteMatch<
  View extends { decision: unknown } = PlayerView,
  ActionT = Action,
  Event = GameEvent,
> implements MatchHost<View, ActionT, Event>
{
  private last: View;
  private readonly listeners = new Set<
    (snapshot: Snapshot<View, Event>) => void
  >();
  private readonly pending: Snapshot<View, Event>[] = [];
  /** 받은 화면을 모두 적어 둔다. 판 끝 검증에서 기록을 다시 돌린 화면과 하나하나 맞춰 본다 */
  readonly seen: string[] = [];

  constructor(
    readonly seat: number,
    first: Snapshot<View, Event>,
    private readonly sendAction: (action: ActionT) => void,
  ) {
    this.last = first.view;
    this.seen.push(JSON.stringify(first.view));
    this.pending.push(first);
  }

  current(): View {
    return this.last;
  }

  drain(): Snapshot<View, Event>[] {
    return this.pending.splice(0);
  }

  /** 결과는 방장 엔진이 정한다. 거절되면 `rejected` 메시지로 알려 온다 */
  submit(action: ActionT): SubmitResult {
    if (this.last.decision === null)
      return { ok: false, error: "지금은 차례가 아니다" };
    this.sendAction(action);
    return { ok: true };
  }

  subscribe(listener: (snapshot: Snapshot<View, Event>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  receive(snapshot: Snapshot<View, Event>): void {
    this.last = snapshot.view;
    this.seen.push(JSON.stringify(snapshot.view));
    if (this.listeners.size === 0) this.pending.push(snapshot);
    for (const l of this.listeners) l(snapshot);
  }
}

export interface GuestRoomOptions<
  Rules = RuleSet,
  State = MatchState,
  View = PlayerView,
  ActionT = Action,
  Event = GameEvent,
  Extra = PresetDeal,
> {
  /** 어떤 게임의 방인가. 없으면 마이티. 판 끝 검증도 이 게임 엔진으로 한다 */
  kit?: GameKit<Rules, State, View, ActionT, Event, Extra>;
  transport: Transport;
  name: string;
  /** 재접속용. 같은 방에 다시 들어올 때 같은 자리를 받는다 */
  token: string | null;
  /** 재접속할 때 처음 약속한 비밀 값을 그대로 쓴다 */
  secret?: string;
  /** 방장과 연결이 끊긴 뒤 다시 연결되기를 기다리는 시간. 지나면 방장이 나간 것으로 본다 */
  reconnectTimeoutMs?: number;
  /**
   * 초대 링크의 방장 공개 열쇠 지문(`?k=`). 있으면 이 열쇠로 서명한 연결만 방장으로 믿는다(identity.ts).
   * 없으면(예전 링크·시험) 처음 "어서 와"라고 답한 연결을 방장으로 믿는다.
   */
  hostFingerprint?: string;
}

/** 방장과의 연결 상태 */
export type ConnectionState = "connected" | "reconnecting";

/** 참가자 방에서 받을 수 있는 알림 */
export interface GuestEvents<
  View extends { decision: unknown },
  ActionT,
  Event,
> {
  lobby: (lobby: LobbyState) => void;
  seat: (seat: number, token: string) => void;
  match: (match: RemoteMatch<View, ActionT, Event>) => void;
  rejected: (error: string) => void;
  full: () => void;
  kicked: () => void;
  chat: (message: ChatMessage) => void;
  report: (report: AuditReport) => void;
  hostLeft: () => void;
  connection: (state: ConnectionState) => void;
  audit: (result: AuditResult) => void;
}

/**
 * 참가자 기기의 방. 방장을 찾아 들어가고, 대기실 정보와 대국 스냅숏을 받는다.
 * 게임이 끝나면 방장이 공개한 비밀 값과 기록으로 시드와 진행을 직접 다시 계산해 확인한다.
 */
export class GuestRoom<
  Rules = RuleSet,
  State = MatchState,
  View extends { decision: unknown } = PlayerView,
  ActionT = Action,
  Event = GameEvent,
  Extra = PresetDeal,
> {
  readonly transport: Transport;
  readonly kit: GameKit<Rules, State, View, ActionT, Event, Extra>;
  readonly secret: string;
  seat: number | null = null;
  token: string | null;
  lobby: LobbyState | null = null;
  match: RemoteMatch<View, ActionT, Event> | null = null;
  private hostId: string | null = null;
  private commitments: Commitment[] = [];
  private readonly name: string;
  private commitHash: Promise<string>;
  /** 방장이 내보냈으면 그 뒤 메시지는 받지 않는다 */
  private kicked = false;
  /** 방장이 방을 닫는다고 알렸다 */
  private hostClosed = false;
  private readonly reconnectTimeoutMs: number;
  private readonly hostFingerprint: string | null;
  /** 상대마다 보낸 입장 요청의 임의 값 */
  private readonly nonces = new Map<string, string>();
  /** 방장 확인(서명 검사)이 끝나기 전에 온 대기실 정보. 확인되면 그 연결의 것을 쓴다 */
  private readonly unverifiedLobby = new Map<string, LobbyState>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 서명이 맞지 않아 무시한 "방장" 응답 수(시험·화면 표시용) */
  impostors = 0;
  private readonly listeners: {
    [K in keyof GuestEvents<View, ActionT, Event>]: Set<
      GuestEvents<View, ActionT, Event>[K]
    >;
  } = {
    lobby: new Set(),
    seat: new Set(),
    match: new Set(),
    rejected: new Set(),
    full: new Set(),
    kicked: new Set(),
    chat: new Set(),
    report: new Set(),
    hostLeft: new Set(),
    connection: new Set(),
    audit: new Set(),
  };

  constructor(
    options: GuestRoomOptions<Rules, State, View, ActionT, Event, Extra>,
  ) {
    this.kit =
      options.kit ??
      (mightyKit as unknown as GameKit<
        Rules,
        State,
        View,
        ActionT,
        Event,
        Extra
      >);
    this.transport = options.transport;
    this.name = options.name;
    this.token = options.token;
    this.secret = options.secret ?? newSecret();
    this.commitHash = commit(this.secret);
    this.reconnectTimeoutMs = options.reconnectTimeoutMs ?? 60_000;
    this.hostFingerprint = options.hostFingerprint ?? null;

    this.transport.onPeerJoin((peerId) => {
      // 누가 방장인지 모르므로 새로 보이는 상대에게 들어가겠다고 알린다. 방장만 답한다.
      // 방장과 끊긴 뒤라면 다시 보이는 상대에게 토큰으로 들어가 같은 자리를 받는다.
      if (this.seat === null || this.hostId === null || this.hostId === peerId)
        void this.sendJoin(peerId);
    });
    this.transport.onPeerLeave((peerId) => {
      if (peerId !== this.hostId) return;
      this.hostId = null;
      if (this.hostClosed) {
        this.emitHostLeft();
        return;
      }
      // 잠깐 끊겼을 수 있으니 바로 끝내지 않고 다시 연결되기를 기다린다.
      for (const l of this.listeners.connection) l("reconnecting");
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(
        () => this.emitHostLeft(),
        this.reconnectTimeoutMs,
      );
    });
    this.transport.onMessage((message, from) => {
      if (isHostMessage<View, Event, ActionT>(message))
        void this.onMessage(message, from);
    });
  }

  on<K extends keyof GuestEvents<View, ActionT, Event>>(
    event: K,
    listener: GuestEvents<View, ActionT, Event>[K],
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.hostId) this.send({ t: "leave" }, this.hostId);
    this.transport.leave();
  }

  private emitHostLeft(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const l of this.listeners.hostLeft) l();
  }

  private async sendJoin(peerId: string): Promise<void> {
    const nonce = newSecret();
    this.nonces.set(peerId, nonce);
    this.send(
      {
        t: "join",
        name: this.name,
        token: this.token,
        commit: await this.commitHash,
        nonce,
      },
      peerId,
    );
  }

  /** 이 연결이 초대 링크의 방장인가. 서명을 확인한다 */
  private async isGenuineHost(
    from: string,
    message: {
      seat: number;
      token: string;
      proof?: { key: string; sig: string };
    },
  ): Promise<boolean> {
    if (this.hostFingerprint === null) return true;
    const nonce = this.nonces.get(from);
    if (!nonce || !message.proof) return false;
    return verifyHostProof(
      this.hostFingerprint,
      message.proof,
      welcomeStatement({
        game: this.kit.id,
        nonce,
        peerId: this.transport.selfId,
        seat: message.seat,
        token: message.token,
      }),
    );
  }

  /** 방장으로 확인한 연결에서 온 메시지인가(확인 전이면 서명이 없는 옛 방식만 받는다) */
  private fromHost(from: string): boolean {
    return this.hostId === null
      ? this.hostFingerprint === null
      : from === this.hostId;
  }

  private send(message: GuestMessage<ActionT>, to: string): void {
    this.transport.send(message, to);
  }

  private async onMessage(
    message: HostMessage<View, Event, ActionT>,
    from: string,
  ): Promise<void> {
    if (this.kicked) return;
    switch (message.t) {
      case "welcome": {
        // 이미 방장을 정했으면 다른 연결의 "어서 와"는 무시한다(방장 사칭).
        if (this.hostId !== null && from !== this.hostId) return;
        if (!(await this.isGenuineHost(from, message))) {
          this.impostors++;
          return;
        }
        const reconnected = this.reconnectTimer !== null;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.hostId = from;
        this.seat = message.seat;
        this.token = message.token;
        for (const l of this.listeners.seat) l(message.seat, message.token);
        const early = this.unverifiedLobby.get(from);
        this.unverifiedLobby.clear();
        if (early) void this.onMessage({ t: "lobby", lobby: early }, from);
        if (reconnected)
          for (const l of this.listeners.connection) l("connected");
        break;
      }
      case "closed":
        if (from !== this.hostId) return;
        this.hostClosed = true;
        break;
      case "full":
        if (!this.fromHost(from)) return;
        for (const l of this.listeners.full) l();
        break;
      case "kicked":
        if (!this.fromHost(from)) return;
        this.kicked = true;
        this.transport.leave();
        for (const l of this.listeners.kicked) l();
        break;
      case "lobby":
        if (!this.fromHost(from)) {
          if (this.hostId === null)
            this.unverifiedLobby.set(from, message.lobby);
          return;
        }
        // 다른 게임(마이티 방에 하트로 들어오는 등)의 방이면 나간다.
        if (message.lobby.game && message.lobby.game !== this.kit.id) {
          this.kicked = true;
          this.transport.leave();
          for (const l of this.listeners.rejected) l("다른 게임의 방입니다");
          return;
        }
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
          this.match = new RemoteMatch<View, ActionT, Event>(
            this.seat,
            snapshot,
            (action) => {
              if (this.hostId) this.send({ t: "action", action }, this.hostId);
            },
          );
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
        // 방장을 거치지 않고 모두에게 결과를 알린다.
        if (this.seat !== null)
          this.transport.send({
            t: "auditReport",
            seat: this.seat,
            name: this.name,
            ok: result.ok,
            ...(result.ok ? {} : { reason: result.reason }),
          } satisfies AuditReport);
        break;
      }
      case "auditReport": {
        if (message.seat === this.seat) return;
        // 보낸 연결이 대기실에 적힌 그 자리의 연결인지 맞춰 본다(다른 자리 사칭).
        const owner = this.lobby?.seats.find((s) => s.seat === message.seat);
        if (owner?.peerId && owner.peerId !== from) return;
        for (const l of this.listeners.report) l(message);
        break;
      }
    }
  }

  /** 방장이 공개한 값으로 시드와 진행을 다시 계산해 내가 본 것과 맞춰 본다 */
  private async verify(
    reveals: Reveal[],
    log: KitLoggedAction<ActionT>[],
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
    const rules = this.kit.decodeRules(this.lobby.ruleCode);
    if (!rules.ok) return { ok: false, reason: rules.reason };
    // 기록을 한 걸음씩 다시 돌리며 매 걸음 내 자리 화면을 만든다.
    let { state } = this.kit.createMatch(rules.rules, seed.seed);
    const replayedViews = [JSON.stringify(this.kit.viewOf(state, this.seat))];
    for (const [index, { seat, action }] of log.entries()) {
      const result = this.kit.step(state, seat, action);
      if (!result.ok)
        return {
          ok: false,
          reason: `기록 ${index + 1}번째 행동이 규칙에 맞지 않는다`,
        };
      state = result.state;
      replayedViews.push(JSON.stringify(this.kit.viewOf(state, this.seat)));
    }
    if (replayedViews.at(-1) !== JSON.stringify(this.match.current())) {
      return { ok: false, reason: "다시 계산한 결과가 내가 본 화면과 다르다" };
    }
    // 게임 중 받은 화면이 모두 다시 돌린 화면 중에 차례대로 있어야 한다(중간 화면 조작).
    let cursor = 0;
    for (const [i, seen] of this.match.seen.entries()) {
      while (cursor < replayedViews.length && replayedViews[cursor] !== seen)
        cursor++;
      if (cursor === replayedViews.length)
        return {
          ok: false,
          reason: `게임 중 받은 ${i + 1}번째 화면이 기록과 맞지 않는다`,
        };
    }
    return { ok: true };
  }
}
