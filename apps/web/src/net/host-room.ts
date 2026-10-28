import type {
  Action,
  Card,
  GameEvent,
  MatchState,
  PlayerView,
  PresetDeal,
  RuleSet,
} from "@mighty/engine";
import {
  type Clock,
  FairHostTable,
  type GroupName,
  HeartsHostTable,
  type Incident,
  realClock,
} from "@mighty/fair-play";
import type {
  Action as HeartsAction,
  GameEvent as HeartsEvent,
  HeartsRules,
  MatchState as HeartsState,
  PlayerView as HeartsView,
} from "@mighty/hearts-engine";
import { botName } from "@/game/bot-names";
import type { GameKit, KitBot, KitLoggedAction } from "@/game/kit";
import { LocalMatch } from "@/game/local-match";
import { mightyKit } from "@/game/mighty-kit";
import type { ArchiveSource } from "@/review/recorder";
import { serializeDeals } from "@/review/replay";
import { watchFairDevice } from "./diag";
import { commit, deriveSeed, newSecret, tokenProof } from "./fairness";
import type { HostRestore, HostSaved, HostStore } from "./host-store";
import {
  createHostIdentity,
  type HostIdentity,
  restoreHostIdentity,
  welcomeStatement,
} from "./identity";
import {
  type AuditReport,
  CHAT_MAX_LENGTH,
  type ChatMessage,
  type Commitment,
  type FairMessage,
  type GuestMessage,
  type HostMessage,
  type IncidentReport,
  isFairMessage,
  isGuestMessage,
  type LobbySeat,
  type LobbyState,
  type Reveal,
} from "./protocol";
import { connectionFingerprints, randomId, type Transport } from "./transport";

export interface HostRoomOptions<
  Rules = RuleSet,
  State = MatchState,
  View = PlayerView,
  ActionT = Action,
  Event = GameEvent,
  Extra = PresetDeal,
> {
  /** 어떤 게임의 방인가. 없으면 마이티 */
  kit?: GameKit<Rules, State, View, ActionT, Event, Extra>;
  transport: Transport;
  hostName: string;
  rules: Rules;
  /** 방장이 저장해 둔 내 규칙이면 그 이름 */
  ruleName?: string;
  /** 사람이 연결이 끊긴 뒤 컴퓨터가 대신 두기까지 기다리는 시간 */
  standInDelayMs?: number;
  /** 시작할 때 참가자의 비밀 값을 기다리는 시간 */
  revealTimeoutMs?: number;
  /** 멘탈 포커 판에서 끊긴 사람을 기다리다 끝내기 투표를 열기까지의 시간 */
  voteDelayMs?: number;
  /** 빈자리와 연결이 끊긴 자리를 맡을 컴퓨터 */
  bot?: KitBot<View, ActionT>;
  /** 그 컴퓨터의 실력 단계. 대기실에 알려 참가자가 판 끝에 컴퓨터 수를 다시 계산하게 한다 */
  botLevel?: number;
  /** 빈자리 컴퓨터 이름(1번 자리부터). 비면 기본 이름 */
  botNames?: readonly string[];
  /** 컴퓨터 수 사이에 차례를 넘기는 방법(`LocalMatchOptions.pace`) */
  pace?: (next: () => void) => void;
  /**
   * 멘탈 포커로 섞고 나눈다(마이티 3~7마). 방장 기기도 남의 패를 모른다.
   * 없으면 예전처럼 방장 기기가 시드로 섞는다
   */
  fair?: { group: GroupName };
  /** 방장 새로고침에 대비해 방과 진행을 남길 곳 */
  store?: HostStore;
  /** 새로고침 전에 남긴 방(`store.load()`). 있으면 그 방을 이어 간다 */
  restore?: HostRestore;
  /** 제한 시간을 재는 시계. 시험은 ManualClock을 넣는다 */
  clock?: Clock;
  /** 시드에 넣을 방장 비밀 값. 시험이 정해진 판으로 돌릴 때만 넣는다(참가자 `secret`과 같이) */
  secret?: string;
}

/** 내 기기가 찾은 부정(`own`) 또는 다른 사람이 알린 부정 */
export interface IncidentNotice {
  reporter: number;
  seat: number | null;
  reason: string;
  own: boolean;
  /** 누가 했는지 확인하는 중(확정 알림이 뒤따른다) */
  pending?: boolean;
}

interface GuestSeat {
  peerId: string | null;
  token: string;
  commit: string;
  secret: string | null;
  /** 컴퓨터가 대신 두기를 거는 타이머를 끄는 함수 */
  standInTimer: (() => void) | null;
}

/**
 * 방장 기기에서 도는 방. 대기실(이름·자리·빈자리 컴퓨터)과 대국 진행을 맡는다.
 * 엔진은 방장 기기에만 있고, 참가자에게는 그 자리에서 보이는 정보만 보낸다(docs/07-security.md).
 */
export class HostRoom<
  Rules = RuleSet,
  State = MatchState,
  View = PlayerView,
  ActionT = Action,
  Event = GameEvent,
  Extra = PresetDeal,
> {
  readonly transport: Transport;
  readonly kit: GameKit<Rules, State, View, ActionT, Event, Extra>;
  private rules: Rules;
  private ruleName: string | null;
  private readonly hostName: string;
  private readonly guests = new Map<number, GuestSeat>();
  private readonly names = new Map<number, string>();
  private readonly hostSecret: string;
  /** 방장 서명 열쇠. 지문을 초대 링크에 넣는다 */
  private readonly identity: Promise<HostIdentity>;
  /** 남길 서명 열쇠(내보내기가 비동기라 받아 둔다) */
  private identityJwk: JsonWebKey | null = null;
  private readonly store: HostStore | null;
  /** 이 판 시드 */
  private seed: number | null = null;
  private hostCommit: string | null = null;
  private readonly standInDelayMs: number;
  private readonly revealTimeoutMs: number;
  private readonly voteDelayMs: number;
  private voteTimer: (() => void) | null = null;
  private readonly clock: Clock;
  /** 끝내기 투표(열려 있을 때). 자리 → 끝내기에 찬성하는가 */
  private endVote: Map<number, boolean> | null = null;
  private readonly bot: KitBot<View, ActionT> | null;
  private readonly botLevel: number | null;
  private readonly pace: ((next: () => void) => void) | null;
  private readonly botNames: readonly string[];
  private lobbyListeners = new Set<(lobby: LobbyState) => void>();
  private chatListeners = new Set<(message: ChatMessage) => void>();
  private reportListeners = new Set<(report: AuditReport) => void>();
  private incidentListeners = new Set<(notice: IncidentNotice) => void>();
  private errorListeners = new Set<(error: string) => void>();
  private fairOption: { group: GroupName } | null;
  /** 멘탈 포커 진행(이 판이 멘탈 포커일 때) */
  fair: FairHostTable | HeartsHostTable | null = null;
  /** 오간 멘탈 포커 메시지. 다시 연결된 참가자에게 다시 보낸다 */
  private readonly fpLog: { from: number; message: FairMessage }[] = [];
  /** 자리별 마지막 채팅 시각. 도배를 막는다 */
  private readonly lastChat = new Map<number, number>();
  private commitments: Commitment[] = [];
  /** 내보낸 사람. 같은 기기로 다시 들어오려 하면 막는다 */
  private readonly kickedPeers = new Set<string>();
  private readonly kickedTokens = new Set<string>();
  match: LocalMatch<Rules, State, View, ActionT, Event, Extra> | null = null;
  private joinQueue: Promise<void> = Promise.resolve();

  constructor(
    options: HostRoomOptions<Rules, State, View, ActionT, Event, Extra>,
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
    this.rules = options.rules;
    this.ruleName = options.ruleName ?? null;
    this.hostName = options.hostName;
    this.standInDelayMs = options.standInDelayMs ?? 30_000;
    this.revealTimeoutMs = options.revealTimeoutMs ?? 8_000;
    this.voteDelayMs = options.voteDelayMs ?? 60_000;
    this.clock = options.clock ?? realClock;
    this.bot = options.bot ?? null;
    this.botLevel = options.botLevel ?? null;
    this.pace = options.pace ?? null;
    this.botNames = options.botNames ?? [];
    this.fairOption = options.fair ?? null;
    this.store = options.store ?? null;
    const restore = options.restore?.saved ?? null;
    this.hostSecret = restore?.hostSecret ?? options.secret ?? newSecret();
    this.identity = restore
      ? restoreHostIdentity(restore.identity)
      : createHostIdentity();
    void this.identity
      .then((identity) => identity.exportPrivate())
      .then((jwk) => {
        this.identityJwk = jwk;
        this.persist();
      });
    void commit(this.hostSecret).then((hash) => {
      this.hostCommit = hash;
    });
    if (options.restore) this.restoreRoom(options.restore);

    this.transport.onPeerJoin(() => this.broadcastLobby());
    this.transport.onPeerLeave((peerId) => this.onPeerLeave(peerId));
    this.transport.onMessage((message, from) => {
      if (isGuestMessage<ActionT>(message)) this.onMessage(message, from);
    });
  }

  private persistScheduled = false;
  /** 바뀐 판(방장 기기가 보낸 멘탈 포커 메시지) */
  private readonly dirtyDeals = new Set<number>();
  /** 판별 방장 기기가 보낸 멘탈 포커 메시지 */
  private readonly ownFair = new Map<number, FairMessage[]>();

  /** 방과 진행을 남긴다. 한 차례에 여러 번 바뀌어도 한 번만 쓴다 */
  private persist(): void {
    if (!this.store || this.persistScheduled) return;
    this.persistScheduled = true;
    queueMicrotask(() => {
      this.persistScheduled = false;
      this.writeStore();
    });
  }

  private writeStore(): void {
    const store = this.store;
    if (!store || !this.identityJwk) return;
    for (const deal of this.dirtyDeals)
      store.saveOwn(deal, this.ownFair.get(deal) ?? []);
    this.dirtyDeals.clear();
    const saved: HostSaved = {
      v: 1,
      game: this.kit.id,
      hostName: this.hostName,
      rules: this.rules,
      ruleName: this.ruleName,
      fair: this.fairOption,
      identity: this.identityJwk,
      hostSecret: this.hostSecret,
      guests: [...this.guests].map(([seat, g]) => ({
        seat,
        token: g.token,
        commit: g.commit,
        secret: g.secret,
        name: this.names.get(seat) ?? "손님",
      })),
      kickedTokens: [...this.kickedTokens],
      commitments: this.commitments,
      match:
        this.match && this.seed !== null
          ? {
              seed: this.seed,
              resume: this.match.resumeState() as never,
              audited: this.audited,
              table: this.fair ? (this.fair.snapshot() as never) : null,
            }
          : null,
    };
    store.save(saved);
  }

  /** 멘탈 포커 메시지를 다시 보내기 기록에 남긴다. 같은 것은 한 번만(새로고침 뒤 다시 받은 것) */
  private logFair(from: number, message: FairMessage): void {
    // 섞기 증명 약속(중간 덱 16벌, 수백 KB)은 다시 보내기·남기기에서 뺀다. 다시 들어온 기기는 그 판 증명을
    // 확인하지 못할 뿐이다. 내 약속은 섞기 열쇠에서 다시 만든다.
    if (message.k === "sproof" && message.commit) {
      // 다시 들어온 기기가 nonce를 공개하려면 남의 약속이 있어야 한다. 진행 중인 판 것만 메모리에 둔다.
      const deal = message.deal;
      for (const [key, kept] of this.proofCommits)
        if (kept.message.deal < deal) this.proofCommits.delete(key);
      this.proofCommits.set(
        `${from}:${deal}:${message.round}:${message.stage}`,
        { from, message },
      );
      return;
    }
    const key = JSON.stringify([from, message]);
    if (this.fpSeen.has(key)) return;
    this.fpSeen.add(key);
    this.fpLog.push({ from, message });
    if (from !== 0) return;
    const deal = fairDealOf(message);
    const list = this.ownFair.get(deal) ?? [];
    list.push(message);
    this.ownFair.set(deal, list);
    this.dirtyDeals.add(deal);
    this.persist();
  }

  private readonly fpSeen = new Set<string>();
  /** 진행 중인 판의 섞기 증명 약속(남기지 않고 다시 들어온 기기에게만 다시 보낸다) */
  private readonly proofCommits = new Map<
    string,
    { from: number; message: Extract<FairMessage, { k: "sproof" }> }
  >();

  /** 새로고침 전에 남긴 방을 되살린다. 참가자는 토큰으로 같은 자리에 다시 들어온다 */
  private restoreRoom({ saved, own }: HostRestore): void {
    this.rules = saved.rules as Rules;
    this.ruleName = saved.ruleName;
    this.fairOption = saved.fair;
    for (const g of saved.guests) {
      this.guests.set(g.seat, {
        peerId: null,
        token: g.token,
        commit: g.commit,
        secret: g.secret,
        standInTimer: null,
      });
      this.names.set(g.seat, g.name);
    }
    for (const t of saved.kickedTokens) this.kickedTokens.add(t);
    this.commitments = saved.commitments;
    const resumed = saved.match;
    if (!resumed) return;
    this.seed = resumed.seed;
    this.audited = resumed.audited;
    const group = this.fairGroup();
    const resume = resumed.resume as never;
    let match: LocalMatch<Rules, State, View, ActionT, Event, Extra>;
    if (group && resumed.table) {
      match = this.startFair(resumed.seed, group, {
        resume,
        device: resumed.table.device,
      });
      this.match = match;
      const table = this.fair as FairHostTable | HeartsHostTable;
      // 내가 보냈던 메시지를 내 기기에 다시 넣는다(섞기 사슬을 다시 계산하지 않게).
      for (const message of own) {
        this.logFair(0, message);
        if (message.k === "chain" || message.k === "keys")
          table.receive(message as never, 0);
      }
      table.resume(resumed.table as never);
    } else {
      match = new LocalMatch<Rules, State, View, ActionT, Event, Extra>({
        kit: this.kit,
        rules: this.rules,
        seed: resumed.seed,
        humanSeat: 0,
        humanSeats: [0, ...this.guests.keys()],
        ...(this.bot ? { bot: this.bot } : {}),
        clock: this.clock,
        ...(this.pace ? { pace: this.pace } : {}),
        afterStep: () => this.persist(),
        resume,
      });
      this.match = match;
      // 멘탈 포커가 아니면 돌아오지 않는 사람 자리는 전처럼 컴퓨터가 대신 둔다.
      for (const [seat, guest] of this.guests)
        guest.standInTimer = this.clock.after(this.standInDelayMs, () =>
          this.match?.setStandIn(seat, true),
        );
    }
    this.subscribeGuests(match);
    match.refresh();
    // 멘탈 포커 판에서 돌아오지 않는 사람이 있으면 전처럼 투표로 끝낼 수 있게 한다.
    this.updateVote();
  }

  /** 참가자 자리마다 화면을 보낸다 */
  private subscribeGuests(
    match: LocalMatch<Rules, State, View, ActionT, Event, Extra>,
  ): void {
    for (const [seat, guest] of this.guests)
      match.subscribeSeat(seat, (snapshot) => {
        if (guest.peerId)
          this.send({ t: "snapshot", ...snapshot }, guest.peerId);
        if (this.kit.isOver(snapshot.view)) this.sendAudit();
      });
  }

  /** 복기용 기록: 시드와 행동 기록, 멘탈 포커 판이면 판별 실제 패(다 연 판까지) */
  archiveSource(): ArchiveSource | null {
    if (!this.match || this.seed === null) return null;
    return {
      rules: this.rules,
      seed: this.seed,
      log: this.match.actionLog() as KitLoggedAction<unknown>[],
      ...(this.fair
        ? {
            deals: serializeDeals(
              this.fair.deals as ReadonlyMap<
                number,
                { cards: ReadonlyMap<number, string> }
              >,
            ),
          }
        : {}),
    };
  }

  /** 되살린 방이 게임 중인가(화면을 바로 게임으로 옮긴다) */
  get resumed(): boolean {
    return this.match !== null;
  }

  /** 방을 끝내며 남긴 것을 지운다 */
  forget(): void {
    this.store?.clear();
  }

  /** 초대 링크에 넣을 방장 공개 열쇠 지문 */
  async fingerprint(): Promise<string> {
    return (await this.identity).fingerprint;
  }

  lobby(): LobbyState {
    const seats: LobbySeat[] = Array.from(
      { length: this.kit.playerCount(this.rules) },
      (_, seat) => {
        if (seat === 0)
          return {
            seat,
            name: this.hostName,
            kind: "host",
            connected: true,
            peerId: this.transport.selfId,
          };
        const guest = this.guests.get(seat);
        if (guest)
          return {
            seat,
            name: this.names.get(seat) ?? "손님",
            kind: "guest",
            connected: guest.peerId !== null,
            ...(guest.peerId ? { peerId: guest.peerId } : {}),
          };
        return {
          seat,
          name: botName(this.botNames, seat),
          kind: "bot",
          connected: true,
        };
      },
    );
    return {
      game: this.kit.id,
      ruleCode: this.kit.encodeRules(this.rules),
      ...(this.ruleName ? { ruleName: this.ruleName } : {}),
      ...(this.botLevel !== null ? { botLevel: this.botLevel } : {}),
      seats,
      started: this.match !== null,
      ...(this.fairGroup()
        ? { fair: { group: this.fairGroup() as GroupName } }
        : {}),
      ...(this.endVote
        ? {
            endVote: {
              votes: [...this.endVote].map(([seat, end]) => ({ seat, end })),
            },
          }
        : {}),
    };
  }

  /** 이 방이 멘탈 포커로 하는가(방장이 켰을 때) */
  private fairGroup(): GroupName | null {
    if (!this.fairOption) return null;
    const count = this.kit.playerCount(this.rules);
    return count >= 2 ? this.fairOption.group : null;
  }

  /** 방장 자기 행동이 준비하다 거절됐다(멘탈 포커는 비동기라 내기 뒤에 알게 된다) */
  onOwnError(listener: (error: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** 대기실에서 멘탈 포커를 켜고 끈다 */
  setFair(fair: { group: GroupName } | null): void {
    if (this.match) return;
    this.fairOption = fair;
    this.broadcastLobby();
  }

  /** 연결이 끊긴 사람을 더 기다리지 않고 게임을 끝낸다(멘탈 포커는 컴퓨터가 대신할 수 없다) */
  abandon(): void {
    if (!this.match) return;
    this.match.end();
    this.closeVote();
    this.broadcastLobby();
  }

  /** 방장의 표. 방장이 끝내기를 고르면 바로 끝낸다 */
  vote(end: boolean): void {
    this.castVote(0, end);
  }

  /** 끝내기 투표에 표를 낼 수 있는 자리: 연결된 사람(방장과 참가자) */
  private voters(): number[] {
    const seats = [0];
    for (const [seat, guest] of this.guests) if (guest.peerId) seats.push(seat);
    return seats;
  }

  /**
   * 멘탈 포커 판에서 끊긴 사람이 있으면 정한 시간 기다렸다가 끝내기 투표를 연다. 모두 돌아오면 닫는다.
   * 그 사람 열쇠 없이는 그 사람 카드를 열 수 없어 컴퓨터가 대신 둘 수 없다(docs/13 4절).
   */
  private updateVote(): void {
    const waiting =
      this.fair !== null &&
      this.match !== null &&
      !this.kit.isOver(this.match.current()) &&
      [...this.guests.values()].some((g) => g.peerId === null);
    if (!waiting) {
      this.closeVote();
      return;
    }
    if (this.endVote || this.voteTimer) return;
    this.voteTimer = this.clock.after(this.voteDelayMs, () => {
      this.voteTimer = null;
      if (![...this.guests.values()].some((g) => g.peerId === null)) return;
      this.endVote = new Map();
      this.broadcastLobby();
    });
  }

  private closeVote(): void {
    this.voteTimer?.();
    this.voteTimer = null;
    this.endVote = null;
  }

  /** 남은 사람의 과반이 끝내기를 고르거나 방장이 끝내기를 고르면 게임을 끝낸다 */
  private castVote(seat: number, end: boolean): void {
    const votes = this.endVote;
    if (!votes || !this.voters().includes(seat)) return;
    votes.set(seat, end);
    const voters = this.voters();
    const ends = voters.filter((s) => votes.get(s) === true).length;
    if ((seat === 0 && end) || ends * 2 > voters.length) {
      const names = voters
        .filter((s) => votes.get(s) === true)
        .map((s) => (s === 0 ? this.hostName : (this.names.get(s) ?? "손님")));
      this.relayChat(
        -1,
        "투표",
        `${names.join(", ")}님이 끝내기를 골라 게임을 끝냅니다`,
      );
      this.abandon();
      return;
    }
    this.broadcastLobby();
  }

  /** 부정 알림(내 기기가 찾은 것과 다른 사람이 알린 것) */
  onIncident(listener: (notice: IncidentNotice) => void): () => void {
    this.incidentListeners.add(listener);
    return () => this.incidentListeners.delete(listener);
  }

  /** 내 기기가 부정을 찾았다: 판을 멈추고 모두에게 알린다 */
  private raiseIncident(incident: Incident): void {
    this.match?.halt(incident.reason);
    const report: IncidentReport = {
      t: "incident",
      reporter: 0,
      seat: incident.seat,
      reason: incident.reason,
      ...(incident.pending ? { pending: true } : {}),
    };
    this.send(report);
    for (const l of this.incidentListeners)
      l({
        reporter: 0,
        seat: incident.seat,
        reason: incident.reason,
        own: true,
        ...(incident.pending ? { pending: true } : {}),
      });
  }

  onLobby(listener: (lobby: LobbyState) => void): () => void {
    this.lobbyListeners.add(listener);
    listener(this.lobby());
    return () => this.lobbyListeners.delete(listener);
  }

  /** 대기실에서 규칙을 바꾼다. `name`은 내 규칙 이름(참가자 화면에 보인다) */
  setRules(rules: Rules, name?: string): void {
    if (this.match) return;
    this.rules = rules;
    this.ruleName = name?.trim() || null;
    // 인원이 줄면 넘치는 자리의 참가자는 내보낸다.
    for (const seat of [...this.guests.keys()]) {
      if (seat >= this.kit.playerCount(rules)) {
        const guest = this.guests.get(seat);
        if (guest?.peerId) this.send({ t: "full" }, guest.peerId);
        this.guests.delete(seat);
        this.names.delete(seat);
      }
    }
    this.broadcastLobby();
  }

  onChat(listener: (message: ChatMessage) => void): () => void {
    this.chatListeners.add(listener);
    return () => this.chatListeners.delete(listener);
  }

  /** 참가자의 검증 결과 알림 */
  onReport(listener: (report: AuditReport) => void): () => void {
    this.reportListeners.add(listener);
    return () => this.reportListeners.delete(listener);
  }

  /** 방장이 말한다 */
  chat(text: string): void {
    this.relayChat(0, this.hostName, text);
  }

  /** 받은 말을 다듬어 모두에게 보낸다. 0.5초 안에 다시 말하면 버린다 */
  private relayChat(seat: number, name: string, text: string): void {
    const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!trimmed) return;
    const now = this.clock.now();
    const last = this.lastChat.get(seat);
    if (last !== undefined && now - last < 500) return;
    this.lastChat.set(seat, now);
    const message: ChatMessage = { id: randomId(8), seat, name, text: trimmed };
    this.send({ t: "chat", message });
    for (const l of this.chatListeners) l(message);
  }

  /** 대기실에서 참가자를 내보낸다. 시작한 뒤에는 할 수 없다 */
  kick(seat: number): void {
    if (this.match) return;
    const guest = this.guests.get(seat);
    if (!guest) return;
    this.kickedTokens.add(guest.token);
    if (guest.peerId) {
      this.kickedPeers.add(guest.peerId);
      this.send({ t: "kicked" }, guest.peerId);
    }
    this.guests.delete(seat);
    this.names.delete(seat);
    this.broadcastLobby();
  }

  /** 대기실을 닫고 게임을 시작한다. 참가자의 비밀 값을 모아 시드를 만든다 */
  async start(): Promise<
    LocalMatch<Rules, State, View, ActionT, Event, Extra>
  > {
    if (this.match) return this.match;
    const hostCommit = this.hostCommit ?? (await commit(this.hostSecret));
    this.hostCommit = hostCommit;
    this.commitments = [
      { seat: 0, hash: hostCommit },
      ...[...this.guests.entries()].map(([seat, g]) => ({
        seat,
        hash: g.commit,
      })),
    ];
    this.send({ t: "started", commitments: this.commitments });

    await this.waitForReveals();
    // 값을 내지 않은 참가자는 시드에서 뺀다(그 사람의 약속도 함께 뺀다).
    this.commitments = this.commitments.filter(
      (c) => c.seat === 0 || this.guests.get(c.seat)?.secret,
    );
    const derived = await deriveSeed(this.commitments, this.reveals());
    if (!derived.ok) throw new Error(derived.reason);

    this.seed = derived.seed;
    const group = this.fairGroup();
    const match = group
      ? this.startFair(derived.seed, group)
      : new LocalMatch<Rules, State, View, ActionT, Event, Extra>({
          kit: this.kit,
          rules: this.rules,
          seed: derived.seed,
          humanSeat: 0,
          humanSeats: [0, ...this.guests.keys()],
          ...(this.bot ? { bot: this.bot } : {}),
          clock: this.clock,
          ...(this.pace ? { pace: this.pace } : {}),
          afterStep: () => this.persist(),
        });
    this.match = match;
    if (this.fair) {
      // 시드는 덱을 정하지 않으므로 바로 공개한다(참가자가 판마다 진행을 다시 계산한다).
      this.send({
        t: "seed",
        reveals: this.reveals(),
        commitments: this.commitments,
      });
      this.fair.begin(match.created as never);
    }
    const startEvents = this.kit.startEvents(match.viewFor(0));
    this.subscribeGuests(match);
    for (const [seat, guest] of this.guests) {
      if (guest.peerId)
        this.send(
          { t: "snapshot", view: match.viewFor(seat), events: startEvents },
          guest.peerId,
        );
    }
    this.broadcastLobby();
    this.persist();
    return match;
  }

  /** 멘탈 포커 판: 엔진은 자리 표를 든 채 진행하고, 증명은 FairHostTable이 모은다 */
  private startFair(
    seed: number,
    group: GroupName,
    restore?: FairResume,
  ): LocalMatch<Rules, State, View, ActionT, Event, Extra> {
    if (this.kit.id === "hearts")
      return this.startFairHearts(seed, group, restore);
    type Mighty = LocalMatch;
    let match: Mighty | null = null;
    const get = () => match as Mighty;
    const table = new FairHostTable({
      rules: this.rules as unknown as RuleSet,
      seed,
      guestSeats: [...this.guests.keys()],
      group,
      clock: this.clock,
      ...(restore ? { restore: restore.device } : {}),
      hooks: {
        patch: (fn) => {
          get().patchState(fn);
          this.persist();
        },
        state: () => get().rawState(),
        log: () => get().actionLog(),
        refresh: () => get().refresh(),
        broadcast: (message) => {
          this.logFair(0, message);
          this.send(message as never);
        },
        onIncident: (incident) => this.raiseIncident(incident),
      },
    });
    this.fair = table;
    table.device.on("persist", () => this.persist());
    watchFairDevice(table.device);
    match = new LocalMatch({
      rules: this.rules as unknown as RuleSet,
      seed,
      humanSeat: 0,
      humanSeats: [0, ...this.guests.keys()],
      presetDeal: table.presetDeal(),
      ...(this.bot
        ? { bot: this.bot as unknown as KitBot<PlayerView, Action> }
        : {}),
      clock: this.clock,
      ...(this.pace ? { pace: this.pace } : {}),
      step: (state, seat, action) => table.step(state, seat, action),
      prepare: (state, seat, action) => table.prepare(state, seat, action),
      revealView: (seat, view) => table.viewFor(seat, view),
      // 카드를 아직 못 열었으면 손패와 결정을 숨긴다(자리 표로 결정하지 않게).
      maskView: (_seat, view) => ({
        ...view,
        hand: [],
        discarded: null,
        decision: null,
      }),
      afterStep: (state, events) => {
        table.after(state, events);
        this.persist();
      },
      onLateError: (seat, error) => {
        if (seat === 0) for (const l of this.errorListeners) l(error);
        const peerId = this.guests.get(seat)?.peerId;
        if (peerId) this.send({ t: "rejected", error }, peerId);
      },
      ...(restore ? { resume: restore.resume as never } : {}),
    });
    return match as unknown as LocalMatch<
      Rules,
      State,
      View,
      ActionT,
      Event,
      Extra
    >;
  }

  /** 하트 멘탈 포커 판. 넘긴 카드 열쇠는 받는 기기에게만 직접 보낸다 */
  private startFairHearts(
    seed: number,
    group: GroupName,
    restore?: FairResume,
  ): LocalMatch<Rules, State, View, ActionT, Event, Extra> {
    type H = LocalMatch<
      HeartsRules,
      HeartsState,
      HeartsView,
      HeartsAction,
      HeartsEvent,
      Card[][]
    >;
    let match: H | null = null;
    const get = () => match as H;
    const table = new HeartsHostTable({
      rules: this.rules as unknown as HeartsRules,
      seed,
      guestSeats: [...this.guests.keys()],
      group,
      clock: this.clock,
      ...(restore ? { restore: restore.device } : {}),
      hooks: {
        patch: (fn) => {
          get().patchState(fn);
          this.persist();
        },
        state: () => get().rawState(),
        log: () => get().actionLog(),
        refresh: () => get().refresh(),
        broadcast: (message) => {
          this.logFair(0, message);
          this.send(message as never);
        },
        // 넘긴 카드 열쇠: 받는 참가자에게만. 다시 보내기 기록(fpLog)에도 남기지 않는다.
        sendTo: (message, device) => {
          const peerId = this.guests.get(device)?.peerId;
          if (peerId) this.send(message as never, peerId);
        },
        onIncident: (incident) => this.raiseIncident(incident),
      },
    });
    this.fair = table;
    table.device.on("persist", () => this.persist());
    watchFairDevice(table.device);
    const kit = this.kit as unknown as GameKit<
      HeartsRules,
      HeartsState,
      HeartsView,
      HeartsAction,
      HeartsEvent,
      Card[][]
    >;
    match = new LocalMatch({
      kit,
      rules: this.rules as unknown as HeartsRules,
      seed,
      humanSeat: 0,
      humanSeats: [0, ...this.guests.keys()],
      presetDeal: table.presetHands(),
      ...(this.bot
        ? { bot: this.bot as unknown as KitBot<HeartsView, HeartsAction> }
        : {}),
      clock: this.clock,
      ...(this.pace ? { pace: this.pace } : {}),
      step: (state, seat, action) => table.step(state, seat, action),
      prepare: (state, seat, action) => table.prepare(state, seat, action),
      revealView: (seat, view) => table.viewFor(seat, view),
      maskView: (_seat, view) => ({
        ...view,
        hand: [],
        myPass: null,
        received: [],
        decision: null,
      }),
      pendingSeats: (state) => table.pendingSeats(state, kit.pendingSeats),
      afterStep: (state, events) => {
        table.after(state, events);
        this.persist();
      },
      onLateError: (seat, error) => {
        if (seat === 0) for (const l of this.errorListeners) l(error);
        const peerId = this.guests.get(seat)?.peerId;
        if (peerId) this.send({ t: "rejected", error }, peerId);
      },
      ...(restore ? { resume: restore.resume as never } : {}),
    });
    return match as unknown as LocalMatch<
      Rules,
      State,
      View,
      ActionT,
      Event,
      Extra
    >;
  }

  /** 게임을 끝내며 검증용 기록을 공개한다 */
  finish(): void {
    this.sendAudit();
  }

  close(): void {
    // 연결이 잠깐 끊긴 것과 구별하도록 닫는다고 먼저 알린다.
    this.send({ t: "closed" });
    this.transport.leave();
    this.forget();
  }

  private audited = false;
  private sendAudit(): void {
    if (!this.match || this.audited) return;
    this.audited = true;
    this.persist();
    this.send({
      t: "audit",
      reveals: this.reveals(),
      log: this.match.actionLog(),
      commitments: this.commitments,
    });
  }

  private reveals(): Reveal[] {
    const reveals: Reveal[] = [{ seat: 0, secret: this.hostSecret }];
    for (const [seat, guest] of this.guests) {
      if (guest.secret) reveals.push({ seat, secret: guest.secret });
    }
    return reveals;
  }

  private waitForReveals(): Promise<void> {
    return new Promise((resolve) => {
      // 기다리는 시간은 시계로 잰다. 확인은 50ms마다 다시 본다.
      const started = this.clock.now();
      const check = () => {
        const all = [...this.guests.values()].every(
          (g) => g.secret !== null || g.peerId === null,
        );
        if (all || this.clock.now() - started > this.revealTimeoutMs) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  /**
   * `to`가 없으면 앉아 있는 참가자에게만 하나씩 보낸다. 링크만 알고 자리가 없는 사람(대기실이 찼거나
   * 시작한 뒤 들어온 사람)은 대기실·채팅·판 끝 기록을 받지 못한다.
   */
  private send(message: HostMessage<View, Event, ActionT>, to?: string): void {
    if (to !== undefined) {
      this.transport.send(message, to);
      return;
    }
    for (const guest of this.guests.values())
      if (guest.peerId) this.transport.send(message, guest.peerId);
  }

  private broadcastLobby(): void {
    const lobby = this.lobby();
    this.send({ t: "lobby", lobby });
    for (const l of this.lobbyListeners) l(lobby);
    this.persist();
  }

  private seatOf(peerId: string): number | null {
    for (const [seat, guest] of this.guests)
      if (guest.peerId === peerId) return seat;
    return null;
  }

  /** 참가자 기기의 멘탈 포커 메시지 */
  private onFairMessage(message: FairMessage, from: string): void {
    const seat = this.seatOf(from);
    const table = this.fair;
    if (seat === null || !table) return;
    // 넘긴 카드 열쇠(하트)는 받는 사람만 봐야 하므로 다시 보내기 기록에 남기지 않는다.
    if (message.k !== "handover") this.logFair(seat, message);
    switch (message.k) {
      case "chain":
      case "keys":
      case "handover":
      case "sproof":
      case "cproof":
        table.receive(message, seat);
        break;
      case "answer":
        if (message.from === seat && table instanceof FairHostTable)
          table.answer(seat, message.id, message.have === true, message.slot);
        break;
    }
  }

  private onMessage(message: GuestMessage<ActionT>, from: string): void {
    if (isFairMessage(message)) {
      this.onFairMessage(message, from);
      return;
    }
    switch (message.t) {
      case "incident": {
        const seat = this.seatOf(from);
        if (seat === null || typeof message.reason !== "string") return;
        for (const l of this.incidentListeners)
          l({
            reporter: seat,
            seat: typeof message.seat === "number" ? message.seat : null,
            reason: message.reason.slice(0, 200),
            ...(message.pending === true ? { pending: true } : {}),
            own: false,
          });
        break;
      }
      case "join":
        // 입장 요청은 하나씩 처리한다. 동시에 처리하면 한 연결이 여러 자리를 받을 수 있다.
        this.joinQueue = this.joinQueue.then(() =>
          this.onJoin(
            from,
            typeof message.name === "string" ? message.name : "손님",
            typeof message.tokenProof === "string" ? message.tokenProof : null,
            typeof message.commit === "string" ? message.commit : "",
            typeof message.nonce === "string" ? message.nonce : null,
          ),
        );
        break;
      case "reveal": {
        const seat = this.seatOf(from);
        const guest = seat === null ? undefined : this.guests.get(seat);
        if (
          !guest ||
          guest.secret !== null ||
          typeof message.secret !== "string"
        )
          return;
        // 약속과 맞는 값만 받는다. 틀린 값은 안 낸 것으로 쳐서 시작이 막히지 않게 한다.
        void commit(message.secret).then((hash) => {
          if (hash === guest.commit && guest.secret === null) {
            guest.secret = message.secret;
            this.persist();
          }
        });
        break;
      }
      case "action": {
        const seat = this.seatOf(from);
        if (seat === null || !this.match) return;
        if (this.kit.guestMayAct && !this.kit.guestMayAct(message.action)) {
          this.send({ t: "rejected", error: "할 수 없는 행동" }, from);
          return;
        }
        const result = this.match.submitAs(seat, message.action);
        if (!result.ok) this.send({ t: "rejected", error: result.error }, from);
        break;
      }
      case "chat": {
        const seat = this.seatOf(from);
        if (seat === null || typeof message.text !== "string") return;
        this.relayChat(seat, this.names.get(seat) ?? "손님", message.text);
        break;
      }
      case "auditReport": {
        // 보낸 사람의 자리로 고쳐 적는다(남의 자리를 사칭하지 못하게).
        const seat = this.seatOf(from);
        if (seat === null) return;
        const report: AuditReport = {
          ...message,
          seat,
          name: this.names.get(seat) ?? message.name,
        };
        for (const l of this.reportListeners) l(report);
        break;
      }
      case "vote": {
        const seat = this.seatOf(from);
        if (seat === null || typeof message.end !== "boolean") return;
        this.castVote(seat, message.end);
        break;
      }
      case "leave":
        this.onPeerLeave(from);
        break;
    }
  }

  /** 들어온 사람에게 자리와 토큰을 알린다. 서명을 붙여 방장임을 증명한다 */
  private async welcome(
    peerId: string,
    seat: number,
    token: string,
    nonce: string | null,
  ): Promise<void> {
    if (nonce === null) {
      this.send({ t: "welcome", seat, token }, peerId);
      return;
    }
    const identity = await this.identity;
    const dtls = await connectionFingerprints(this.transport, peerId);
    const sig = await identity.sign(
      welcomeStatement({
        game: this.kit.id,
        nonce,
        peerId,
        seat,
        token,
        dtls: dtls ? { host: dtls.local, guest: dtls.remote } : null,
      }),
    );
    this.send(
      { t: "welcome", seat, token, proof: { key: identity.publicKey, sig } },
      peerId,
    );
  }

  private async onJoin(
    peerId: string,
    name: string,
    proof: string | null,
    commitHash: string,
    nonce: string | null,
  ): Promise<void> {
    const me = this.transport.selfId;
    const matches = async (token: string) =>
      proof !== null && (await tokenProof(token, me)) === proof;
    let kickedToken = false;
    for (const token of this.kickedTokens)
      if (await matches(token)) kickedToken = true;
    if (this.kickedPeers.has(peerId) || kickedToken) {
      this.send({ t: "kicked" }, peerId);
      return;
    }
    // 이미 앉은 연결이 다시 요청하면 새 자리를 주지 않고 같은 자리를 다시 알린다(한 연결로 여러 자리).
    const already = this.seatOf(peerId);
    if (already !== null) {
      const guest = this.guests.get(already);
      if (guest) await this.welcome(peerId, already, guest.token, nonce);
      return;
    }
    // 재접속: 토큰 증명이 맞으면 같은 자리로 돌려보낸다.
    for (const [seat, guest] of this.guests) {
      if (await matches(guest.token)) {
        const token = guest.token;
        guest.peerId = peerId;
        guest.standInTimer?.();
        guest.standInTimer = null;
        await this.welcome(peerId, seat, token, nonce);
        if (this.match) {
          this.match.setStandIn(seat, false);
          this.send({ t: "started", commitments: this.commitments }, peerId);
          if (this.fair) {
            // 새로고침했으면 대기실 정보부터 다시 있어야 멘탈 포커 진행을 만든다.
            this.send({ t: "lobby", lobby: this.lobby() }, peerId);
            this.send(
              {
                t: "seed",
                reveals: this.reveals(),
                commitments: this.commitments,
              },
              peerId,
            );
            // 끊긴 동안 오간 멘탈 포커 메시지와 걸음별 사건을 다시 보낸다(이미 받은 것은 참가자가 건너뛴다).
            this.send(
              {
                t: "fpRelay",
                items: [...this.fpLog, ...this.proofCommits.values()],
              },
              peerId,
            );
            this.send(
              { t: "fpHistory", items: [...this.fair.history] as never },
              peerId,
            );
          }
          this.send(
            {
              t: "snapshot",
              view: this.match.viewFor(seat),
              events: [],
              resync: true,
              mine: this.match.actionLog().filter((e) => e.seat === seat)
                .length,
            },
            peerId,
          );
        }
        this.updateVote();
        this.broadcastLobby();
        return;
      }
    }
    if (this.match) {
      this.send({ t: "full" }, peerId);
      return;
    }
    const free = Array.from(
      { length: this.kit.playerCount(this.rules) },
      (_, s) => s,
    ).find((s) => s !== 0 && !this.guests.has(s));
    if (free === undefined) {
      this.send({ t: "full" }, peerId);
      return;
    }
    const newToken = randomId(24);
    this.guests.set(free, {
      peerId,
      token: newToken,
      commit: commitHash,
      secret: null,
      standInTimer: null,
    });
    this.names.set(free, name.trim().slice(0, 12) || "손님");
    await this.welcome(peerId, free, newToken, nonce);
    this.broadcastLobby();
  }

  private onPeerLeave(peerId: string): void {
    const seat = this.seatOf(peerId);
    if (seat === null) return;
    const guest = this.guests.get(seat);
    if (!guest) return;
    guest.peerId = null;
    if (!this.match) {
      // 시작 전에 나가면 자리를 비운다.
      this.guests.delete(seat);
      this.names.delete(seat);
    } else if (!this.fair) {
      // 멘탈 포커 판은 그 사람 카드를 아무도 열 수 없어 컴퓨터가 대신 둘 수 없다. 돌아오기를 기다린다.
      guest.standInTimer = this.clock.after(this.standInDelayMs, () =>
        this.match?.setStandIn(seat, true),
      );
    }
    this.updateVote();
    this.broadcastLobby();
  }
}

/** 새로고침한 방장이 멘탈 포커 판을 이어 갈 때 */
interface FairResume {
  resume: unknown;
  device: Record<number, import("@mighty/fair-play").PartySnapshot>;
}

/** 멘탈 포커 메시지가 속한 판 */
function fairDealOf(message: FairMessage): number {
  const m = message as { deal?: number; query?: { deal?: number } };
  return m.deal ?? m.query?.deal ?? 0;
}
