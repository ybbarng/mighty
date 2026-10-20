import type { Bot } from "@mighty/ai";
import { encodeRuleString, type RuleSet } from "@mighty/engine";

import { LocalMatch } from "@/game/local-match";

import { commit, deriveSeed, newSecret } from "./fairness";
import {
  type AuditReport,
  CHAT_MAX_LENGTH,
  type ChatMessage,
  type Commitment,
  type GuestMessage,
  type HostMessage,
  isGuestMessage,
  type LobbySeat,
  type LobbyState,
  type Reveal,
} from "./protocol";
import { randomId, type Transport } from "./transport";

export interface HostRoomOptions {
  transport: Transport;
  hostName: string;
  rules: RuleSet;
  /** 사람이 연결이 끊긴 뒤 컴퓨터가 대신 두기까지 기다리는 시간 */
  standInDelayMs?: number;
  /** 시작할 때 참가자의 비밀 값을 기다리는 시간 */
  revealTimeoutMs?: number;
  /** 빈자리와 연결이 끊긴 자리를 맡을 컴퓨터 */
  bot?: Bot;
  /** 빈자리 컴퓨터 이름(1번 자리부터). 비면 "컴퓨터 n" */
  botNames?: readonly string[];
  /** 컴퓨터 수 사이에 차례를 넘기는 방법(`LocalMatchOptions.pace`) */
  pace?: (next: () => void) => void;
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
export class HostRoom {
  readonly transport: Transport;
  private rules: RuleSet;
  private readonly hostName: string;
  private readonly guests = new Map<number, GuestSeat>();
  private readonly names = new Map<number, string>();
  private readonly hostSecret = newSecret();
  private hostCommit: string | null = null;
  private readonly standInDelayMs: number;
  private readonly revealTimeoutMs: number;
  private readonly bot: Bot | null;
  private readonly pace: ((next: () => void) => void) | null;
  private readonly botNames: readonly string[];
  private lobbyListeners = new Set<(lobby: LobbyState) => void>();
  private chatListeners = new Set<(message: ChatMessage) => void>();
  private reportListeners = new Set<(report: AuditReport) => void>();
  /** 자리별 마지막 채팅 시각. 도배를 막는다 */
  private readonly lastChat = new Map<number, number>();
  private commitments: Commitment[] = [];
  /** 내보낸 사람. 같은 기기로 다시 들어오려 하면 막는다 */
  private readonly kickedPeers = new Set<string>();
  private readonly kickedTokens = new Set<string>();
  match: LocalMatch | null = null;

  constructor(options: HostRoomOptions) {
    this.transport = options.transport;
    this.rules = options.rules;
    this.hostName = options.hostName;
    this.standInDelayMs = options.standInDelayMs ?? 30_000;
    this.revealTimeoutMs = options.revealTimeoutMs ?? 8_000;
    this.bot = options.bot ?? null;
    this.pace = options.pace ?? null;
    this.botNames = options.botNames ?? [];
    void commit(this.hostSecret).then((hash) => {
      this.hostCommit = hash;
    });

    this.transport.onPeerJoin(() => this.broadcastLobby());
    this.transport.onPeerLeave((peerId) => this.onPeerLeave(peerId));
    this.transport.onMessage((message, from) => {
      if (isGuestMessage(message)) this.onMessage(message, from);
    });
  }

  lobby(): LobbyState {
    const seats: LobbySeat[] = Array.from(
      { length: this.rules.playerCount },
      (_, seat) => {
        if (seat === 0)
          return { seat, name: this.hostName, kind: "host", connected: true };
        const guest = this.guests.get(seat);
        if (guest)
          return {
            seat,
            name: this.names.get(seat) ?? "손님",
            kind: "guest",
            connected: guest.peerId !== null,
          };
        return {
          seat,
          name: this.botNames[seat - 1]?.trim() || `컴퓨터 ${seat}`,
          kind: "bot",
          connected: true,
        };
      },
    );
    return {
      ruleCode: encodeRuleString(this.rules),
      seats,
      started: this.match !== null,
    };
  }

  onLobby(listener: (lobby: LobbyState) => void): () => void {
    this.lobbyListeners.add(listener);
    listener(this.lobby());
    return () => this.lobbyListeners.delete(listener);
  }

  setRules(rules: RuleSet): void {
    if (this.match) return;
    this.rules = rules;
    // 인원이 줄면 넘치는 자리의 참가자는 내보낸다.
    for (const seat of [...this.guests.keys()]) {
      if (seat >= rules.playerCount) {
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
  async start(): Promise<LocalMatch> {
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

    const match = new LocalMatch({
      rules: this.rules,
      seed: derived.seed,
      humanSeat: 0,
      humanSeats: [0, ...this.guests.keys()],
      ...(this.bot ? { bot: this.bot } : {}),
      ...(this.pace ? { pace: this.pace } : {}),
    });
    this.match = match;
    const first = match.viewFor(0);
    const startEvents = [
      {
        type: "roundStarted" as const,
        roundNumber: first.roundNumber,
        beginner: first.beginner,
      },
      { type: "dealt" as const, handSize: first.hand.length },
    ];
    for (const [seat, guest] of this.guests) {
      match.subscribeSeat(seat, (snapshot) => {
        if (guest.peerId)
          this.send({ t: "snapshot", ...snapshot }, guest.peerId);
        if (snapshot.view.phase === "gameOver") this.sendAudit();
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

  /** 게임을 끝내며 검증용 기록을 공개한다 */
  finish(): void {
    this.sendAudit();
  }

  close(): void {
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

  private send(message: HostMessage, to?: string): void {
    this.transport.send(message, to);
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

  private onMessage(message: GuestMessage, from: string): void {
    switch (message.t) {
      case "join":
        this.onJoin(from, message.name, message.token, message.commit);
        break;
      case "reveal": {
        const seat = this.seatOf(from);
        const guest = seat === null ? undefined : this.guests.get(seat);
        if (guest && guest.secret === null) guest.secret = message.secret;
        break;
      }
      case "action": {
        const seat = this.seatOf(from);
        if (seat === null || !this.match) return;
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

  private onJoin(
    peerId: string,
    name: string,
    token: string | null,
    commitHash: string,
  ): void {
    if (
      this.kickedPeers.has(peerId) ||
      (token !== null && this.kickedTokens.has(token))
    ) {
      this.send({ t: "kicked" }, peerId);
      return;
    }
    // 재접속: 같은 토큰이면 같은 자리로 돌려보낸다.
    for (const [seat, guest] of this.guests) {
      if (token !== null && guest.token === token) {
        guest.peerId = peerId;
        if (guest.standInTimer) clearTimeout(guest.standInTimer);
        guest.standInTimer = null;
        this.send({ t: "welcome", seat, token }, peerId);
        if (this.match) {
          this.match.setStandIn(seat, false);
          this.send({ t: "started", commitments: this.commitments }, peerId);
          this.send(
            { t: "snapshot", view: this.match.viewFor(seat), events: [] },
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
      { length: this.rules.playerCount },
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
    this.send({ t: "welcome", seat: free, token: newToken }, peerId);
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
    } else {
      guest.standInTimer = setTimeout(
        () => this.match?.setStandIn(seat, true),
        this.standInDelayMs,
      );
    }
    this.broadcastLobby();
  }
}
