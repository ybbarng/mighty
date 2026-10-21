import type {
  Action,
  GameEvent,
  MatchState,
  PlayerView,
  PresetDeal,
  RuleSet,
} from "@mighty/engine";
import {
  FairHostTable,
  type GroupName,
  type Incident,
} from "@mighty/fair-play";
import { botName } from "@/game/bot-names";
import type { GameKit, KitBot } from "@/game/kit";
import { LocalMatch } from "@/game/local-match";
import { mightyKit } from "@/game/mighty-kit";
import { commit, deriveSeed, newSecret, tokenProof } from "./fairness";
import {
  createHostIdentity,
  type HostIdentity,
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
import { randomId, type Transport } from "./transport";

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
}

/** 내 기기가 찾은 부정(`own`) 또는 다른 사람이 알린 부정 */
export interface IncidentNotice {
  reporter: number;
  seat: number | null;
  reason: string;
  own: boolean;
}

interface GuestSeat {
  peerId: string | null;
  token: string;
  commit: string;
  secret: string | null;
  standInTimer: ReturnType<typeof setTimeout> | null;
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
  private readonly hostSecret = newSecret();
  /** 방장 서명 열쇠. 지문을 초대 링크에 넣는다 */
  private readonly identity: Promise<HostIdentity> = createHostIdentity();
  private hostCommit: string | null = null;
  private readonly standInDelayMs: number;
  private readonly revealTimeoutMs: number;
  private readonly bot: KitBot<View, ActionT> | null;
  private readonly botLevel: number | null;
  private readonly pace: ((next: () => void) => void) | null;
  private readonly botNames: readonly string[];
  private lobbyListeners = new Set<(lobby: LobbyState) => void>();
  private chatListeners = new Set<(message: ChatMessage) => void>();
  private reportListeners = new Set<(report: AuditReport) => void>();
  private incidentListeners = new Set<(notice: IncidentNotice) => void>();
  private fairOption: { group: GroupName } | null;
  /** 멘탈 포커 진행(이 판이 멘탈 포커일 때) */
  fair: FairHostTable | null = null;
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
    this.bot = options.bot ?? null;
    this.botLevel = options.botLevel ?? null;
    this.pace = options.pace ?? null;
    this.botNames = options.botNames ?? [];
    this.fairOption = options.fair ?? null;
    void commit(this.hostSecret).then((hash) => {
      this.hostCommit = hash;
    });

    this.transport.onPeerJoin(() => this.broadcastLobby());
    this.transport.onPeerLeave((peerId) => this.onPeerLeave(peerId));
    this.transport.onMessage((message, from) => {
      if (isGuestMessage<ActionT>(message)) this.onMessage(message, from);
    });
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
    };
  }

  /** 이 방이 멘탈 포커로 하는가(마이티 3~7마이고 방장이 켰을 때) */
  private fairGroup(): GroupName | null {
    if (!this.fairOption || this.kit.id !== "mighty") return null;
    const count = this.kit.playerCount(this.rules);
    return count >= 3 ? this.fairOption.group : null;
  }

  /** 대기실에서 멘탈 포커를 켜고 끈다 */
  setFair(fair: { group: GroupName } | null): void {
    if (this.match) return;
    this.fairOption = fair;
    this.broadcastLobby();
  }

  /** 연결이 끊긴 사람을 더 기다리지 않고 게임을 끝낸다(멘탈 포커는 컴퓨터가 대신할 수 없다) */
  abandon(): void {
    this.match?.submit({ type: "retire" } as unknown as ActionT);
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
    };
    this.send(report);
    for (const l of this.incidentListeners)
      l({
        reporter: 0,
        seat: incident.seat,
        reason: incident.reason,
        own: true,
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
    const now = Date.now();
    if (now - (this.lastChat.get(seat) ?? 0) < 500) return;
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
          ...(this.pace ? { pace: this.pace } : {}),
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
    for (const [seat, guest] of this.guests) {
      match.subscribeSeat(seat, (snapshot) => {
        if (guest.peerId)
          this.send({ t: "snapshot", ...snapshot }, guest.peerId);
        if (this.kit.isOver(snapshot.view)) this.sendAudit();
      });
      if (guest.peerId)
        this.send(
          { t: "snapshot", view: match.viewFor(seat), events: startEvents },
          guest.peerId,
        );
    }
    this.broadcastLobby();
    return match;
  }

  /** 멘탈 포커 판: 엔진은 자리 표를 든 채 진행하고, 증명은 FairHostTable이 모은다 */
  private startFair(
    seed: number,
    group: GroupName,
  ): LocalMatch<Rules, State, View, ActionT, Event, Extra> {
    type Mighty = LocalMatch;
    let match: Mighty | null = null;
    const get = () => match as Mighty;
    const table = new FairHostTable({
      rules: this.rules as unknown as RuleSet,
      seed,
      guestSeats: [...this.guests.keys()],
      group,
      hooks: {
        patch: (fn) => get().patchState(fn),
        state: () => get().rawState(),
        log: () => get().actionLog(),
        refresh: () => get().refresh(),
        broadcast: (message) => {
          this.fpLog.push({ from: 0, message });
          this.send(message as never);
        },
        onIncident: (incident) => this.raiseIncident(incident),
      },
    });
    this.fair = table;
    match = new LocalMatch({
      rules: this.rules as unknown as RuleSet,
      seed,
      humanSeat: 0,
      humanSeats: [0, ...this.guests.keys()],
      presetDeal: table.presetDeal(),
      ...(this.bot
        ? { bot: this.bot as unknown as KitBot<PlayerView, Action> }
        : {}),
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
      afterStep: (state, events) => table.after(state, events),
      onLateError: (seat, error) => {
        const peerId = this.guests.get(seat)?.peerId;
        if (peerId) this.send({ t: "rejected", error }, peerId);
      },
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
  }

  private audited = false;
  private sendAudit(): void {
    if (!this.match || this.audited) return;
    this.audited = true;
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
      const started = Date.now();
      const check = () => {
        const all = [...this.guests.values()].every(
          (g) => g.secret !== null || g.peerId === null,
        );
        if (all || Date.now() - started > this.revealTimeoutMs) resolve();
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
    this.fpLog.push({ from: seat, message });
    switch (message.k) {
      case "chain":
      case "keys":
        table.receive(message, seat);
        break;
      case "answer":
        if (message.from === seat)
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
          if (hash === guest.commit && guest.secret === null)
            guest.secret = message.secret;
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
    const sig = await identity.sign(
      welcomeStatement({ game: this.kit.id, nonce, peerId, seat, token }),
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
        if (guest.standInTimer) clearTimeout(guest.standInTimer);
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
            this.send({ t: "fpRelay", items: [...this.fpLog] }, peerId);
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
            },
            peerId,
          );
        }
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
      guest.standInTimer = setTimeout(
        () => this.match?.setStandIn(seat, true),
        this.standInDelayMs,
      );
    }
    this.broadcastLobby();
  }
}
