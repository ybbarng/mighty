import {
  type Action,
  createRng,
  type GameEvent,
  type MatchState,
  type PlayerView,
  type PresetDeal,
  type RuleSet,
} from "@mighty/engine";

import {
  type Clock,
  checkHeartsReplay,
  FairGuestSeat,
  type FairLogged,
  HeartsGuestSeat,
  type Incident,
  type PartySnapshot,
  realClock,
  realHeartsAction,
} from "@mighty/fair-play";
import {
  type HeartsRules,
  viewOf as heartsViewOf,
} from "@mighty/hearts-engine";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import type { GameKit, KitLoggedAction } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";
import type { ArchiveSource } from "@/review/recorder";
import { serializeDeals } from "@/review/replay";
import { watchFairDevice } from "./diag";
import { type FairReplayGame, verifyFairLog } from "./fair-verify";
import { commit, deriveSeed, newSecret, tokenProof } from "./fairness";
import { verifyHostProof, welcomeStatement } from "./identity";
import {
  type AuditReport,
  type ChatMessage,
  type Commitment,
  type FairMessage,
  type GuestMessage,
  type HostMessage,
  type IncidentReport,
  isFairMessage,
  isHostMessage,
  type LobbyState,
  type Reveal,
} from "./protocol";
import { connectionFingerprints, type Transport } from "./transport";

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
  /** 내가 보낸 행동. 판 끝 기록 속 내 자리 행동과 맞춰 본다(방장의 바꿔치기) */
  readonly sent: string[] = [];

  constructor(
    readonly seat: number,
    first: Snapshot<View, Event>,
    private readonly sendAction: (action: ActionT) => void,
    /** 보내기 전에 행동을 바꾼다(멘탈 포커: 낼 카드 열쇠 공개, 버릴 카드를 자리 표로). null이면 못 보낸다 */
    private readonly transform?: (action: ActionT) => ActionT | null,
    /** 내 차례가 아니어도 보낼 수 있는 행동(`GameKit.offTurn`) */
    private readonly offTurn?: (view: View, action: ActionT) => boolean,
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
    if (this.last.decision === null && !this.offTurn?.(this.last, action))
      return { ok: false, error: "지금은 차례가 아니다" };
    // 보낸 행동의 결과(다음 화면이나 거절)가 오기 전에는 다음 행동을 보내지 않는다.
    // 멘탈 포커에서는 낼 카드 열쇠를 공개하므로, 두 번 누르면 두 번째 카드까지 드러난다.
    if (this.inFlight)
      return { ok: false, error: "앞 행동을 처리하는 중입니다" };
    const outgoing = this.transform ? this.transform(action) : action;
    if (outgoing === null)
      return { ok: false, error: "지금은 할 수 없습니다(섞고 나누는 중)" };
    this.sent.push(JSON.stringify(outgoing));
    this.inFlight = true;
    this.sendAction(outgoing);
    return { ok: true };
  }

  subscribe(listener: (snapshot: Snapshot<View, Event>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 보낸 행동의 결과를 기다리는 중 */
  private inFlight = false;

  /** 보낸 행동이 거절됐다 */
  rejected(): void {
    this.inFlight = false;
    this.sent.pop();
  }

  /**
   * 새로고침한 방장의 기록에 내 행동이 `mine`개뿐이다: 결과를 기다리던 행동을 받지 못했다.
   * 그 행동을 그대로 다시 보낸다(카드 열쇠는 이미 공개했다)
   */
  resendLost(mine: number): void {
    if (!this.inFlight || this.sent.length !== mine + 1) return;
    this.resent = true;
    this.sendAction(JSON.parse(this.sent.at(-1) as string) as ActionT);
  }

  /** 다시 보낸 행동의 결과가 아직이다(바로 뒤에 오는 지금 화면은 그 결과가 아니다) */
  private resent = false;

  receive(snapshot: Snapshot<View, Event>): void {
    if (this.resent) this.resent = false;
    else this.inFlight = false;
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
  /** 제한 시간을 재는 시계. 시험은 ManualClock을 넣는다 */
  clock?: Clock;
  /**
   * 초대 링크의 방장 공개 열쇠 지문(`?k=`). 있으면 이 열쇠로 서명한 연결만 방장으로 믿는다(identity.ts).
   * 없으면(예전 링크·시험) 처음 "어서 와"라고 답한 연결을 방장으로 믿는다.
   */
  hostFingerprint?: string;
  /**
   * 멘탈 포커 열쇠와 보낸 행동을 브라우저에 남기고 되살린다(새로고침해도 같은 판을 이어 가게).
   * 열쇠가 없으면 내 카드를 아무도 열 수 없다
   */
  fairStore?: {
    load(): FairSaved | null;
    save(saved: FairSaved): void;
  };
}

/** 새로고침에 대비해 남기는 멘탈 포커 정보 */
export interface FairSaved {
  snapshots: Record<number, PartySnapshot>;
  sent: string[];
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
  /** 부정 알림. `own`이면 내 기기가 찾은 것이다 */
  incident: (notice: {
    reporter: number;
    seat: number | null;
    reason: string;
    own: boolean;
  }) => void;
  /** 멘탈 포커: 한 판을 진짜 카드로 다시 계산해 문제가 없었다 */
  roundVerified: (deal: number) => void;
  /** 복기용 기록이 늘었다(판 검증·게임 끝 검증을 통과했을 때) */
  archive: (source: ArchiveSource) => void;
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
  private readonly fairStore: GuestRoomOptions["fairStore"] | null;
  /** 상대마다 보낸 입장 요청의 임의 값 */
  private readonly nonces = new Map<string, string>();
  /** 방장 확인(서명 검사)이 끝나기 전에 온 대기실 정보. 확인되면 그 연결의 것을 쓴다 */
  private readonly unverifiedLobby = new Map<string, LobbyState>();
  /** 방장이 나간 것으로 보는 타이머를 끄는 함수 */
  private reconnectTimer: (() => void) | null = null;
  private readonly clock: Clock;
  /** 지금 보이는 상대들. 방장이 끊긴 사이 새로 보인 상대도 기억해 끊김을 안 뒤 들어가 본다 */
  private readonly peers = new Set<string>();
  /** 마지막으로 확인한 방장 연결. 다른 연결로 돌아오면 방장이 새로고침한 것이다 */
  private lastHostId: string | null = null;
  /** 새로고침한 방장이 보낼 지금 화면에서 받지 못한 내 행동을 확인한다 */
  private checkLost = false;
  /** 내 기기가 보낸 멘탈 포커 메시지. 새로고침한 방장에게 다시 보낸다 */
  private readonly ownFair: { message: FairMessage; to: number | null }[] = [];
  private readonly ownFairSeen = new Set<string>();
  /** 서명이 맞지 않아 무시한 "방장" 응답 수(시험·화면 표시용) */
  impostors = 0;
  /** 시작할 때 방장이 알린 약속 */
  private startedCommitments: Commitment[] = [];
  /** 시작 때 방장이 내 약속을 빼거나 바꿨다 */
  private startProblem: string | null = null;
  /** 방장과 한 번이라도 끊겼다(그동안 컴퓨터가 대신 둘 수 있다) */
  private everDisconnected = false;
  private audited = false;
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
    incident: new Set(),
    roundVerified: new Set(),
    archive: new Set(),
  };
  /** 멘탈 포커 진행(이 방이 멘탈 포커일 때, 첫 화면을 받으면 만든다) */
  fair: FairGuestSeat | HeartsGuestSeat | null = null;
  /** 멘탈 포커 판: 시작하자마자 공개된 시드 */
  private fairSeed: number | null = null;
  /** 진행 중인 판에 내가 보낸 섞기 증명 약속 */
  private ownCommits: Extract<FairMessage, { k: "sproof" }>[] = [];
  /** 일반 판: 게임 끝 검증 중인 복기용 기록 */
  private pendingArchive: ArchiveSource | null = null;

  /** 멘탈 포커 판: 검증을 통과한 기록과 판별 실제 패를 복기용으로 알린다 */
  private emitArchive(
    rules: unknown,
    seed: number,
    log: readonly FairLogged[],
  ): void {
    if (!this.fair) return;
    const source: ArchiveSource = {
      rules,
      seed,
      log: [...log] as KitLoggedAction<unknown>[],
      deals: serializeDeals(
        this.fair.deals as ReadonlyMap<
          number,
          { cards: ReadonlyMap<number, string> }
        >,
      ),
    };
    for (const l of this.listeners.archive) l(source);
  }
  /** 진행을 만들기 전에 온 멘탈 포커 메시지 */
  private readonly fairEarly: { message: FairMessage; from: number }[] = [];

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
    this.clock = options.clock ?? realClock;
    this.hostFingerprint = options.hostFingerprint ?? null;
    this.fairStore = options.fairStore ?? null;

    this.transport.onPeerJoin((peerId) => {
      this.peers.add(peerId);
      // 누가 방장인지 모르므로 새로 보이는 상대에게 들어가겠다고 알린다. 방장만 답한다.
      // 방장과 끊긴 뒤라면 다시 보이는 상대에게 토큰으로 들어가 같은 자리를 받는다.
      if (this.seat === null || this.hostId === null || this.hostId === peerId)
        void this.sendJoin(peerId);
    });
    this.transport.onPeerLeave((peerId) => {
      this.peers.delete(peerId);
      if (peerId !== this.hostId) return;
      this.hostId = null;
      // 새로고침한 방장이 끊김을 알기 전에 먼저 보였을 수 있다. 보이는 상대 모두에게 들어가 본다.
      if (!this.hostClosed && this.seat !== null)
        for (const peer of this.peers) void this.sendJoin(peer);
      if (this.hostClosed) {
        this.emitHostLeft();
        return;
      }
      this.everDisconnected = true;
      // 잠깐 끊겼을 수 있으니 바로 끝내지 않고 다시 연결되기를 기다린다.
      for (const l of this.listeners.connection) l("reconnecting");
      this.reconnectTimer?.();
      this.reconnectTimer = this.clock.after(this.reconnectTimeoutMs, () =>
        this.emitHostLeft(),
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

  /** 끝내기 투표에 표를 낸다(`LobbyState.endVote`) */
  vote(end: boolean): void {
    if (this.hostId) this.send({ t: "vote", end }, this.hostId);
  }

  leave(): void {
    this.reconnectTimer?.();
    this.reconnectTimer = null;
    if (this.hostId) this.send({ t: "leave" }, this.hostId);
    this.transport.leave();
  }

  private emitHostLeft(): void {
    this.reconnectTimer?.();
    this.reconnectTimer = null;
    // 게임을 했는데 방장이 판 끝 기록을 공개하지 않고 나갔다(모의 침투 A2).
    if (this.match && !this.audited) {
      this.audited = true;
      const result: AuditResult = {
        ok: false,
        reason: "방장이 판 끝 기록을 공개하지 않고 나가 검증하지 못했다",
      };
      for (const l of this.listeners.audit) l(result);
    }
    for (const l of this.listeners.hostLeft) l();
  }

  private async sendJoin(peerId: string): Promise<void> {
    const nonce = newSecret();
    this.nonces.set(peerId, nonce);
    this.send(
      {
        t: "join",
        name: this.name,
        // 토큰은 받는 사람 연결 아이디에 묶은 증명으로만 보낸다(엿들어도 다른 데서 못 쓴다).
        tokenProof: this.token ? await tokenProof(this.token, peerId) : null,
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
    // WebRTC 연결이면 내가 본 이 연결의 인증서가 방장이 서명한 것과 같아야 한다(신호 릴레이 중간자).
    // 지문을 못 얻는 WebRTC 연결은 확인하지 못하므로 믿지 않는다(지문을 빼서 피해 가지 못하게).
    const dtls = await connectionFingerprints(this.transport, from);
    if (this.transport.fingerprints && !dtls) return false;
    return verifyHostProof(
      this.hostFingerprint,
      message.proof,
      welcomeStatement({
        game: this.kit.id,
        nonce,
        peerId: this.transport.selfId,
        seat: message.seat,
        token: message.token,
        dtls: dtls ? { host: dtls.remote, guest: dtls.local } : null,
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

  /** 연결 아이디 → 자리(대기실에 적힌 연결). 모르면 null */
  private seatOfPeer(peerId: string): number | null {
    if (peerId === this.hostId) return 0;
    const seat = this.lobby?.seats.find(
      (s) => s.kind === "guest" && s.peerId === peerId,
    );
    return seat ? seat.seat : null;
  }

  private onFair(message: FairMessage, from: number): void {
    if (!this.fair) {
      this.fairEarly.push({ message, from });
      return;
    }
    this.fair.receive(message, from);
  }

  /** 첫 화면을 받으면 멘탈 포커 진행을 만든다 */
  /** 기기 번호(자리)로 연결 아이디. 방장 기기는 0 */
  private peerOfDevice(device: number): string | null {
    if (device === 0) return this.hostId;
    return (
      this.lobby?.seats.find((s) => s.seat === device && s.kind === "guest")
        ?.peerId ?? null
    );
  }

  private ensureFair(): FairGuestSeat | HeartsGuestSeat | null {
    if (this.fair) return this.fair;
    const lobby = this.lobby;
    if (!lobby?.fair || this.seat === null) return null;
    const rules = this.kit.decodeRules(lobby.ruleCode);
    if (!rules.ok) return null;
    const seat = this.seat;
    const saved = this.fairStore?.load() ?? null;
    const common = {
      seat,
      guestSeats: lobby.seats
        .filter((s) => s.kind === "guest")
        .map((s) => s.seat),
      group: lobby.fair.group,
      broadcast: (message: FairMessage) => {
        this.rememberOwn(message, null);
        this.transport.send(message);
      },
      onIncident: (incident: Incident) => this.raiseIncident(incident),
      clock: this.clock,
      ...(saved ? { restore: saved.snapshots } : {}),
    };
    const fair =
      this.kit.id === "hearts"
        ? new HeartsGuestSeat({
            ...common,
            rules: rules.rules as unknown as HeartsRules,
            // 넘긴 카드 열쇠는 받는 기기에게만 직접 보낸다(방장을 거치지 않는다).
            sendTo: (message, device) => {
              if (device === 0) this.rememberOwn(message, 0);
              const peer = this.peerOfDevice(device);
              if (peer) this.transport.send(message, peer);
            },
            onSnapshot: (view, events) =>
              this.deliver({
                view: view as unknown as View,
                events: events as unknown as Event[],
              }),
            onVerify: (deal, log) =>
              void this.verifyRound(deal, log as unknown as FairLogged[]),
          })
        : new FairGuestSeat({
            ...common,
            rules: rules.rules as unknown as RuleSet,
            onSnapshot: (view, events) =>
              this.deliver({
                view: view as unknown as View,
                events: events as unknown as Event[],
              }),
            onVerify: (deal, log) => void this.verifyRound(deal, log),
          });
    this.fair = fair;
    this.restoredSent = saved?.sent ?? [];
    fair.device.on("persist", () => this.persistFair());
    watchFairDevice(fair.device);
    for (const { message, from } of this.fairEarly.splice(0))
      fair.receive(message, from);
    return fair;
  }

  /** 내가 보낸 멘탈 포커 메시지를 기억한다(묻는 말에 한 답은 그때뿐이라 뺀다) */
  private rememberOwn(message: FairMessage, to: number | null): void {
    if (message.k === "answer") return;
    // 섞기 증명 약속은 커서 진행 중인 판 것만 메모리에 둔다(새로고침한 방장이 nonce를 공개하는 데 필요하다).
    if (message.k === "sproof" && message.commit) {
      this.ownCommits = [
        ...this.ownCommits.filter((m) => m.deal >= message.deal),
        message,
      ];
      return;
    }
    const key = JSON.stringify(message);
    if (this.ownFairSeen.has(key)) return;
    this.ownFairSeen.add(key);
    this.ownFair.push({ message, to });
  }

  /** 새로고침한 방장에게 내가 보냈던 멘탈 포커 메시지를 다시 보낸다(방장은 자기 것만 남긴다) */
  private resendOwnFair(hostId: string): void {
    for (const { message } of this.ownFair)
      this.transport.send(message, hostId);
    for (const message of this.ownCommits) this.transport.send(message, hostId);
  }

  /** 새로고침 전에 보낸 행동(되살린 대국의 `sent` 앞에 붙인다) */
  private restoredSent: string[] = [];

  private persistFair(): void {
    if (!this.fair || !this.fairStore) return;
    this.fairStore.save({
      snapshots: this.fair.device.snapshotAll(),
      sent: this.match ? [...this.match.sent] : this.restoredSent,
    });
  }

  /** 내 기기가 부정을 찾았다: 모두에게 알리고 화면에 표시한다 */
  private raiseIncident(incident: Incident): void {
    if (this.seat === null) return;
    const report: IncidentReport = {
      t: "incident",
      reporter: this.seat,
      seat: incident.seat,
      reason: incident.reason,
      ...(incident.pending ? { pending: true } : {}),
    };
    this.transport.send(report);
    for (const l of this.listeners.incident)
      l({
        reporter: this.seat,
        seat: incident.seat,
        reason: incident.reason,
        own: true,
        ...(incident.pending ? { pending: true } : {}),
      });
  }

  /** 화면을 대국에 넘긴다(첫 화면이면 대국을 만든다) */
  private deliver(snapshot: Snapshot<View, Event>): void {
    if (this.seat === null) return;
    if (this.match) {
      this.match.receive(snapshot);
      return;
    }
    this.match = new RemoteMatch<View, ActionT, Event>(
      this.seat,
      snapshot,
      (action) => {
        if (this.hostId) this.send({ t: "action", action }, this.hostId);
        this.persistFair();
      },
      this.fair
        ? (action) =>
            (this.fair?.outgoing(action as never) as ActionT | null) ?? null
        : undefined,
      this.kit.offTurn
        ? (view, action) => this.kit.offTurn?.(view, action) ?? false
        : undefined,
    );
    this.match.sent.push(...this.restoredSent);
    for (const l of this.listeners.match) l(this.match);
  }

  private fairInput(log: readonly FairLogged[]) {
    const lobby = this.lobby;
    if (!lobby || this.seat === null || !this.match || !this.fair) return null;
    if (this.fairSeed === null) return null;
    const rules = this.kit.decodeRules(lobby.ruleCode);
    if (!rules.ok) return null;
    const level = lobby.botLevel;
    const bot =
      level !== undefined && this.kit.botFor ? this.kit.botFor(level) : null;
    return {
      ...(this.kit.id === "hearts" ? { game: this.heartsReplay() } : {}),
      rules: rules.rules as unknown as RuleSet,
      seed: this.fairSeed,
      seat: this.seat,
      log,
      deals: this.fair.deals,
      botSeats: new Set(
        lobby.seats.filter((s) => s.kind === "bot").map((s) => s.seat),
      ),
      bot: bot as never,
      sent: this.match.sent,
      seen: this.match.seen,
    };
  }

  /** 하트 판 다시 계산하기 */
  private heartsReplay(): FairReplayGame {
    const kit = this.kit;
    return {
      check: (rules, seed, log, deals) =>
        checkHeartsReplay(
          rules as HeartsRules,
          seed,
          log as never,
          deals as never,
        ),
      viewOf: (state, seat) => heartsViewOf(state as never, seat),
      realAction: (action, cards) =>
        realHeartsAction(action as never, cards as never),
      annotate: (view, action) =>
        kit.annotateBotAction
          ? kit.annotateBotAction(view as View, action as ActionT)
          : action,
    };
  }

  /** 마지막 턴에 판 전체를 진짜 카드로 다시 계산한다 */
  private async verifyRound(deal: number, log: FairLogged[]): Promise<void> {
    const input = this.fairInput(log);
    if (!input) {
      this.raiseIncident({
        seat: 0,
        reason: "방장이 시드를 공개하지 않아 검증하지 못했다",
      });
      return;
    }
    const verdict = await verifyFairLog({ ...input, inFlight: true });
    if (verdict.ok) {
      for (const l of this.listeners.roundVerified) l(deal);
      this.emitArchive(input.rules, input.seed, log);
      return;
    }
    this.fair?.coordinator.incident({
      seat: verdict.seat,
      reason: verdict.reason,
    });
  }

  private async onMessage(
    message: HostMessage<View, Event, ActionT>,
    from: string,
  ): Promise<void> {
    if (this.kicked) return;
    if (isFairMessage(message)) {
      const seat = this.seatOfPeer(from);
      if (seat !== null) this.onFair(message, seat);
      return;
    }
    switch (message.t) {
      case "incident": {
        const seat = this.seatOfPeer(from);
        if (seat === null || seat === this.seat || seat !== message.reporter)
          return;
        if (typeof message.reason !== "string") return;
        for (const l of this.listeners.incident)
          l({
            reporter: seat,
            ...(message.pending === true ? { pending: true } : {}),
            seat: typeof message.seat === "number" ? message.seat : null,
            reason: message.reason.slice(0, 200),
            own: false,
          });
        break;
      }
      case "seed": {
        if (from !== this.hostId) return;
        // 바로 앞의 "started"가 먼저 처리되게 같은 값을 기다린다(메시지 처리가 비동기다).
        await this.commitHash;
        const checked = await this.checkSeed(
          message.reveals,
          message.commitments,
        );
        if (!checked.ok) {
          this.raiseIncident({ seat: 0, reason: checked.reason });
          return;
        }
        this.fairSeed = checked.seed;
        break;
      }
      case "fpHistory": {
        if (from !== this.hostId || !Array.isArray(message.items)) return;
        this.ensureFair()?.history(message.items as never);
        break;
      }
      case "fpRelay": {
        if (from !== this.hostId || !Array.isArray(message.items)) return;
        for (const item of message.items)
          if (isFairMessage(item.message) && typeof item.from === "number") {
            // 내가 새로고침했으면 내가 보냈던 것도 여기서 다시 안다.
            if (item.from === this.seat) this.rememberOwn(item.message, null);
            this.onFair(item.message, item.from);
          }
        break;
      }
      case "welcome": {
        // 이미 방장을 정했으면 다른 연결의 "어서 와"는 무시한다(방장 사칭).
        if (this.hostId !== null && from !== this.hostId) return;
        if (!(await this.isGenuineHost(from, message))) {
          this.impostors++;
          return;
        }
        const reconnected = this.reconnectTimer !== null;
        this.reconnectTimer?.();
        this.reconnectTimer = null;
        const restarted = this.lastHostId !== null && this.lastHostId !== from;
        this.hostId = from;
        this.lastHostId = from;
        if (restarted || reconnected) {
          // 방장이 새로고침했거나 잠깐 끊겼다: 끊긴 동안 보낸 것은 방장에게 가지 못했다(새로고침이면 그 전 것도 없다).
          // 내가 보낸 멘탈 포커 메시지를 다시 보내고(방장은 같은 것을 한 번만 받는다),
          // 받지 못한 행동이 있는지 지금 화면에서 확인한다.
          this.checkLost = true;
          this.resendOwnFair(from);
        }
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
      case "started": {
        if (from !== this.hostId) return;
        // 방장이 내 약속을 빼거나 바꿔 알리면 시드를 혼자 정하려는 것이다(모의 침투 A1).
        const myHash = await this.commitHash;
        const mine = message.commitments.find((c) => c.seat === this.seat);
        if (mine?.hash !== myHash)
          this.startProblem = "방장이 시작할 때 내 약속을 빼거나 바꿨다";
        if (this.startedCommitments.length === 0)
          this.startedCommitments = message.commitments;
        this.commitments = message.commitments;
        // 방장 것까지 모든 약속을 받은 뒤에야 비밀 값을 방장에게만 보낸다.
        this.send({ t: "reveal", secret: this.secret }, from);
        break;
      }
      case "snapshot": {
        if (from !== this.hostId || this.seat === null) return;
        if (message.resync && this.checkLost) {
          this.checkLost = false;
          if (typeof message.mine === "number")
            this.match?.resendLost(message.mine);
        }
        const snapshot = { view: message.view, events: message.events };
        const fair = this.ensureFair();
        // 멘탈 포커: 자리 표를 내가 연 카드로 바꿔 넘긴다(못 열었으면 열 때까지 미룬다).
        if (fair)
          fair.snapshot(
            message.view as never,
            message.events as never,
            message.resync === true,
          );
        else this.deliver(snapshot);
        break;
      }
      case "chat":
        if (from !== this.hostId) return;
        // 자리 번호가 음수인 줄(검증 결과 같은 시스템 줄)은 내 기기에서만 만든다.
        if (
          typeof message.message?.seat !== "number" ||
          message.message.seat < 0
        )
          return;
        for (const l of this.listeners.chat) l(message.message);
        break;
      case "rejected":
        if (!this.fromHost(from)) return;
        // 거절된 행동은 기록에 없으므로 보낸 목록에서 뺀다.
        this.match?.rejected();
        for (const l of this.listeners.rejected) l(message.error);
        break;
      case "audit": {
        if (from !== this.hostId || this.audited) return;
        this.audited = true;
        const result = this.fair
          ? await this.verifyFairEnd(message.log as unknown as FairLogged[])
          : await this.verify(
              message.reveals,
              message.log,
              message.commitments,
            );
        for (const l of this.listeners.audit) l(result);
        if (result.ok && this.pendingArchive)
          for (const l of this.listeners.archive) l(this.pendingArchive);
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
        if (!owner?.peerId || owner.peerId !== from) return;
        for (const l of this.listeners.report) l(message);
        break;
      }
    }
  }

  /** 멘탈 포커 판 끝: 다 열린 판까지 기록 전체를 다시 계산한다 */
  private async verifyFairEnd(log: FairLogged[]): Promise<AuditResult> {
    if (this.startProblem) return { ok: false, reason: this.startProblem };
    const input = this.fairInput(log);
    if (!input) return { ok: false, reason: "검증할 정보가 없다" };
    // 끝까지 하지 못한 판(그만두기 등)은 열쇠가 다 모이지 않아 그 앞까지만 본다(verifyFairLog).
    const verdict = await verifyFairLog(input);
    if (verdict.ok) this.emitArchive(input.rules, input.seed, log);
    return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason };
  }

  /** 시작 때 알린 약속과 공개한 값으로 시드를 다시 만든다 */
  private async checkSeed(
    reveals: Reveal[],
    finalCommitments: Commitment[],
  ): Promise<{ ok: true; seed: number } | { ok: false; reason: string }> {
    if (this.startProblem) return { ok: false, reason: this.startProblem };
    for (const c of finalCommitments) {
      const announced = this.startedCommitments.find((s) => s.seat === c.seat);
      if (announced?.hash !== c.hash)
        return {
          ok: false,
          reason: `${c.seat}번 자리 약속이 시작 때와 다르다`,
        };
    }
    if (!finalCommitments.some((c) => c.seat === this.seat))
      return { ok: false, reason: "방장이 내 값을 시드에서 뺐다" };
    const mine = reveals.find((r) => r.seat === this.seat);
    if (mine?.secret !== this.secret)
      return { ok: false, reason: "방장이 내 비밀 값을 바꿨다" };
    const seed = await deriveSeed(finalCommitments, reveals);
    return seed;
  }

  /** 방장이 공개한 값으로 시드와 진행을 다시 계산해 내가 본 것과 맞춰 본다 */
  private async verify(
    reveals: Reveal[],
    log: KitLoggedAction<ActionT>[],
    finalCommitments?: Commitment[],
  ): Promise<AuditResult> {
    if (this.seat === null || !this.lobby || !this.match)
      return { ok: false, reason: "대국 정보가 없다" };
    if (this.startProblem) return { ok: false, reason: this.startProblem };
    // 실제로 시드에 쓴 약속: 시작 때 알린 것 중에서만, 바꾸지 않고, 내 것과 방장 것은 반드시 들어 있어야 한다.
    if (finalCommitments) {
      for (const c of finalCommitments) {
        const announced = this.startedCommitments.find(
          (s) => s.seat === c.seat,
        );
        if (announced?.hash !== c.hash)
          return {
            ok: false,
            reason: `${c.seat}번 자리 약속이 시작 때와 다르다`,
          };
      }
      if (!finalCommitments.some((c) => c.seat === this.seat))
        return { ok: false, reason: "방장이 내 값을 시드에서 뺐다" };
      if (!finalCommitments.some((c) => c.seat === 0))
        return { ok: false, reason: "방장 약속이 없다" };
      this.commitments = finalCommitments;
    }
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
    // 검증을 통과하면 복기용으로 남긴다(audit 처리에서 결과를 보고 알린다).
    this.pendingArchive = {
      rules: rules.rules,
      seed: seed.seed,
      log: log as KitLoggedAction<unknown>[],
    };
    // 기록을 한 걸음씩 다시 돌리며 매 걸음 내 자리 화면을 만든다.
    // 컴퓨터 수는 같은 컴퓨터·같은 난수로 다시 계산해 기록과 맞춰 본다(방장의 컴퓨터 조종, 모의 침투 A4).
    const level = this.lobby.botLevel;
    const bot =
      level !== undefined && this.kit.botFor ? this.kit.botFor(level) : null;
    const botRng = createRng(seed.seed ^ 0x2545f491);
    const botSeats = new Set(
      this.lobby.seats.filter((s) => s.kind === "bot").map((s) => s.seat),
    );
    let { state } = this.kit.createMatch(rules.rules, seed.seed);
    const replayedViews = [JSON.stringify(this.kit.viewOf(state, this.seat))];
    for (const [index, entry] of log.entries()) {
      const { seat, action } = entry;
      // 방장 시계가 남긴 기록(시간패, 응답 창 끝)은 누가 둔 수가 아니다. 엔진이 시간이 다 됐는지 확인한다.
      const byClock = this.kit.timing?.strip(action) === null;
      if (bot && !byClock) {
        if (botSeats.has(seat) && !entry.bot)
          return {
            ok: false,
            reason: `기록 ${index + 1}번째: 컴퓨터 자리를 사람이 뒀다`,
          };
        if (entry.bot) {
          const view = this.kit.viewOf(state, seat);
          const decided = bot.decide(view, botRng);
          const expected = this.kit.annotateBotAction
            ? this.kit.annotateBotAction(view, decided)
            : decided;
          // 방장이 컴퓨터 수에도 쓴 시간을 실을 수 있으니 시간 꼬리표를 떼고 견준다.
          const bare = (a: ActionT) =>
            JSON.stringify(this.kit.timing ? this.kit.timing.strip(a) : a);
          if (bare(expected) !== bare(action))
            return {
              ok: false,
              reason: `기록 ${index + 1}번째: 컴퓨터가 둘 수와 다르다(방장이 컴퓨터를 조종했다)`,
            };
          // 고수 컴퓨터는 생각이 길어 중간중간 화면에 차례를 넘긴다.
          if (index % 8 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      }
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
    // 기록 속 내 자리 행동이 내가 보낸 행동과 같아야 한다(방장의 바꿔치기, 모의 침투 A3).
    // 끊긴 적이 있으면 그동안 컴퓨터가 대신 둔 수가 끼어 있을 수 있으므로, 내가 보낸 것이 빠짐없이 차례대로 들어 있는지만 본다.
    // 개인 시간: 방장이 실은 쓴 시간(spent)과 방장 시계가 남긴 시간패는 내가 보낸 것이 아니라 빼고 본다.
    const timing = this.kit.timing;
    const mineInLog = log
      .filter((entry) => entry.seat === this.seat)
      .map((entry) => (timing ? timing.strip(entry.action) : entry.action))
      .filter((action) => action !== null)
      .map((action) => JSON.stringify(action));
    const sent = this.match.sent;
    if (!this.everDisconnected) {
      if (JSON.stringify(mineInLog) !== JSON.stringify(sent))
        return { ok: false, reason: "기록 속 내 행동이 내가 보낸 것과 다르다" };
    } else {
      let at = 0;
      for (const action of mineInLog) if (action === sent[at]) at++;
      if (at < sent.length)
        return {
          ok: false,
          reason: "내가 보낸 행동이 기록에서 빠졌거나 바뀌었다",
        };
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
