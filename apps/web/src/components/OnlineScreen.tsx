"use client";

import {
  decodeRuleString,
  encodeRuleString,
  RULE_PRESETS,
  type RuleSet,
} from "@mighty/engine";
import { useEffect, useRef, useState } from "react";
import { botFor, browserPace } from "@/game/bots";
import { ruleLabel, useSettings } from "@/game/settings";
import { useGame } from "@/game/store";
import { cn } from "@/lib/cn";
import {
  type AuditRecord,
  loadAuditHistory,
  recordAudit,
} from "@/net/audit-history";
import { useChat } from "@/net/chat";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import {
  type HostRestore,
  sessionHostStore,
  setHostingRoom,
} from "@/net/host-store";
import type { LobbyState } from "@/net/protocol";
import {
  fairStoreFor,
  hostFingerprintFromUrl,
  inviteUrl,
  loadSeatToken,
  onlineSession,
  openTransport,
  saveSeatToken,
  testVoteDelayMs,
} from "@/net/session";
import { randomId } from "@/net/transport";

import { Logo } from "./brand/Logo";
import { ChatBox } from "./ChatBox";
import {
  announceRoundVerified,
  type BusyCoordinator,
  bindFair,
  endVoteOf,
  FairLine,
  type IncidentNoticeLike,
  reportIncident,
} from "./FairLine";
import { InviteQr } from "./InviteQr";
import { ActionButton } from "./panels/common";
import { RuleEditor } from "./rules/RuleEditor";

type Phase = "name" | "connecting" | "lobby" | "full" | "kicked" | "error";

/** 연결이 끊긴 사람 자리 */
function offlineSeatsOf(lobby: LobbyState): number[] {
  return lobby.seats
    .filter((s) => s.kind === "guest" && !s.connected)
    .map((s) => s.seat);
}

function seatNamesOf(lobby: LobbyState): string[] {
  return lobby.seats.map((s) => s.name);
}

/**
 * 친구와 하기: 방장은 방을 만들어 초대 링크를 보내고, 참가자는 링크로 들어온다.
 * 대기실에서 방장이 시작하면 빈자리는 컴퓨터가 채운다.
 */
export function OnlineScreen({
  rules,
  roomFromUrl,
  resume,
  onBack,
  onPlaying,
}: {
  rules: RuleSet;
  /** 초대 링크로 들어왔으면 방 코드 */
  roomFromUrl: string | null;
  /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
  resume?: { room: string; restore: HostRestore };
  onBack: () => void;
  onPlaying: () => void;
}) {
  const savedName = useSettings((s) => s.playerName);
  const customRules = useSettings((s) => s.customRules);
  const [editingRules, setEditingRules] = useState(false);
  /** 규칙 이름. 방장이 붙인 이름 → 기본 규칙·내 규칙 → "직접 정한 n마" */
  const ruleName = (code: string, given?: string) =>
    given ?? ruleLabel(code, customRules);
  /** 내 규칙과 같으면 그 이름(참가자에게 보인다) */
  const customName = (code: string) =>
    customRules.find((r) => r.code === code)?.name;
  const setPlayerName = useSettings((s) => s.setPlayerName);
  const attachOnline = useGame((s) => s.attachOnline);
  const setSeatNames = useGame((s) => s.setSeatNames);
  const reconnecting = useGame((s) => s.reconnecting);
  const hostLeft = useGame((s) => s.hostLeft);
  const [name, setName] = useState(savedName);
  const [phase, setPhase] = useState<Phase>("name");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [roomCode] = useState(
    () => roomFromUrl ?? resume?.room ?? randomId(16),
  );
  const [copied, setCopied] = useState(false);
  /** 온라인 대국: 내 기록에 남긴다(같은 방은 같은 대국이라 새로고침해도 같은 판을 두 번 남기지 않는다) */
  const onlineOptions = {
    network: true,
    stats: {
      game: "mighty",
      mode: "online" as const,
      key: `online:${roomCode}`,
    },
  };
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방장 공개 열쇠 지문. 초대 링크에 넣는다 */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const isHost = roomFromUrl === null;
  // 저장소는 브라우저에만 있으므로 그린 뒤에 읽는다.
  const [history, setHistory] = useState<AuditRecord[]>([]);
  useEffect(() => setHistory(loadAuditHistory()), []);
  const started = useRef(false);

  useEffect(() => {
    if (savedName && !name) setName(savedName);
  }, [savedName, name]);

  // 방장이 새로고침했으면 이름을 다시 묻지 않고 그 방을 다시 연다.
  const resumed = useRef(false);
  useEffect(() => {
    if (!resume || resumed.current) return;
    resumed.current = true;
    void enter();
  });

  /** 판 끝 검증 결과(내 것과 다른 사람이 알린 것)를 채팅에 남기고, 실패면 게임을 무효로 표시한다 */
  /**
   * 판 끝 검증 결과를 채팅에 남긴다. 게임을 무효로 표시하는 것은 **내 기기의 검증**뿐이다.
   * 다른 사람의 실패 알림은 그 사람의 주장으로만 보여 준다. 판 끝 기록은 모두 같은 것을 받으므로,
   * 남이 거짓으로 "실패"라고 알려 게임을 무효로 만드는 것을 막는다(모의 침투 B3).
   */
  const onAuditReport = (who: string, ok: boolean, reason?: string) => {
    const own = who === "나";
    const failure = ok ? null : `${who}: ${reason ?? "알 수 없는 문제"}`;
    useChat.getState().receive({
      id: randomId(8),
      seat: -1,
      name: "검증",
      text: ok
        ? `${who} — 문제없음 ✓`
        : own
          ? `${who} — 실패 ⚠ ${reason ?? ""}`
          : `${who}의 주장 — 실패 ⚠ ${reason ?? ""} (내 검증과 따로 봅니다)`,
    });
    if (own) {
      if (failure) useGame.setState({ invalid: failure });
      recordAudit(roomCode, failure);
    }
  };

  const onIncident = (n: IncidentNoticeLike, names: string[]) =>
    reportIncident(n, names, useGame);
  const attachFair = (
    coordinator: BusyCoordinator | undefined,
    endGame: (() => void) | null,
    vote: (end: boolean) => void,
  ) => bindFair(useGame, coordinator, endGame, vote);

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await openTransport(roomCode);
      if (isHost) {
        const initialRuleName = customName(encodeRuleString(rules));
        const host = new HostRoom({
          transport,
          hostName: resume?.restore.saved.hostName ?? trimmed,
          rules,
          ...(initialRuleName ? { ruleName: initialRuleName } : {}),
          store: sessionHostStore(roomCode),
          ...(resume ? { restore: resume.restore } : {}),
          bot: botFor(useSettings.getState().botLevel),
          botLevel: useSettings.getState().botLevel,
          botNames: useSettings.getState().botNames,
          pace: browserPace,
          ...testVoteDelayMs(),
          ...(useSettings.getState().fairPlay
            ? { fair: { group: "2048" as const } }
            : {}),
        });
        onlineSession.host = host;
        setFingerprint(await host.fingerprint());
        useChat.getState().reset();
        useChat.setState({ send: (text) => host.chat(text) });
        host.onChat((m) => useChat.getState().receive(m));
        host.onReport((r) => onAuditReport(r.name, r.ok, r.reason));
        host.onIncident((n) => onIncident(n, seatNamesOf(host.lobby())));
        host.onOwnError((error) => {
          console.warn("[멘탈 포커] 방장 행동 거절:", error);
          useGame.setState({ notice: error });
        });
        host.onLobby((l) => {
          setLobby(l);
          setSeatNames(seatNamesOf(l));
          useGame.setState({
            offlineSeats: offlineSeatsOf(l),
            endVote: endVoteOf(l),
          });
        });
        setHostingRoom("mighty", roomCode);
        setPhase("lobby");
        // 새로고침 전에 게임 중이었으면 바로 게임 화면으로 간다. 참가자들은 토큰으로 다시 들어온다.
        if (host.match) {
          started.current = true;
          attachOnline(host.match, seatNamesOf(host.lobby()), onlineOptions);
          attachFair(
            host.fair?.coordinator,
            () => host.abandon(),
            (end) => host.vote(end),
          );
          onPlaying();
        }
      } else {
        const saved = loadSeatToken(roomCode);
        const guest = new GuestRoom({
          transport,
          name: trimmed,
          token: saved?.token ?? null,
          ...(saved ? { secret: saved.secret } : {}),
          fairStore: fairStoreFor(roomCode),
          ...(hostFingerprintFromUrl()
            ? { hostFingerprint: hostFingerprintFromUrl() as string }
            : {}),
        });
        onlineSession.guest = guest;
        useChat.getState().reset();
        useChat.setState({ send: (text) => guest.chat(text) });
        guest.on("chat", (m) => useChat.getState().receive(m));
        guest.on("seat", (_seat, token) =>
          saveSeatToken(roomCode, { token, secret: guest.secret }),
        );
        guest.on("lobby", (l) => {
          setLobby(l);
          setPhase("lobby");
          setSeatNames(seatNamesOf(l));
          useGame.setState({
            offlineSeats: offlineSeatsOf(l),
            endVote: endVoteOf(l),
          });
        });
        guest.on("full", () => setPhase("full"));
        guest.on("kicked", () => setPhase("kicked"));
        guest.on("hostLeft", () =>
          useGame.setState({ hostLeft: true, reconnecting: false }),
        );
        guest.on("connection", (state) =>
          useGame.setState({ reconnecting: state === "reconnecting" }),
        );
        guest.on("rejected", (e) => useGame.setState({ notice: e }));
        guest.on("audit", (result) => {
          useGame.setState({
            audit: result,
            notice: result.ok
              ? "공정성 확인: 섞기와 진행에 문제가 없습니다"
              : `공정성 확인 실패: ${result.reason}`,
          });
          onAuditReport("나", result.ok, result.ok ? undefined : result.reason);
        });
        guest.on("report", (r) => onAuditReport(r.name, r.ok, r.reason));
        guest.on("incident", (n) =>
          onIncident(
            n,
            seatNamesOf(
              guest.lobby ?? { seats: [], ruleCode: "", started: true },
            ),
          ),
        );
        guest.on("roundVerified", announceRoundVerified);
        guest.on("match", (match) => {
          if (started.current) return;
          started.current = true;
          attachOnline(
            match,
            seatNamesOf(
              guest.lobby ?? { seats: [], ruleCode: "", started: true },
            ),
            onlineOptions,
          );
          attachFair(guest.fair?.coordinator, null, (end) => guest.vote(end));
          onPlaying();
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const start = async () => {
    const host = onlineSession.host;
    if (!host || starting) return;
    setStarting(true);
    try {
      const match = await host.start();
      attachOnline(match, seatNamesOf(host.lobby()), onlineOptions);
      attachFair(
        host.fair?.coordinator,
        () => host.abandon(),
        (end) => host.vote(end),
      );
      onPlaying();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const link =
    typeof window === "undefined" || !fingerprint
      ? ""
      : inviteUrl(roomCode, fingerprint);
  const share = async () => {
    try {
      if (navigator.share)
        await navigator.share({ title: "마이티 한 판 하자", url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // 공유 창을 닫은 경우
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur">
        <div className="flex justify-center">
          <Logo size={160} />
        </div>
        <h2 className="text-center font-bold text-lg">
          {isHost ? "방 만들기" : "초대받은 방에 들어가기"}
        </h2>

        {phase === "name" && (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              내 이름
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                placeholder="친구들에게 보일 이름"
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2"
              />
            </label>
            {isHost && (
              <p className="text-xs opacity-60">
                규칙: {ruleName(encodeRuleString(rules))}
                {" · "}
                {rules.playerCount}명. 빈자리는 컴퓨터가 채웁니다.
              </p>
            )}
            <ActionButton
              className="py-3 text-base"
              onClick={() => void enter()}
            >
              {isHost ? "방 만들기" : "들어가기"}
            </ActionButton>
            {history.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer opacity-70">
                  지난 게임 공정성 검증 기록
                </summary>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {history.slice(0, 5).map((r) => (
                    <li key={`${r.room}-${r.at}`} className="flex gap-2">
                      <span className="tabular-nums opacity-60">
                        {new Date(r.at).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span
                        className={r.ok ? "text-emerald-300" : "text-rose-300"}
                      >
                        {r.ok ? "문제없음" : `무효 — ${r.failures.join(", ")}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {phase === "connecting" && (
          <p className="text-center text-sm opacity-80">
            {isHost ? "방을 여는 중…" : "방장을 찾는 중… 잠시만 기다려 주세요"}
          </p>
        )}

        {phase === "lobby" && lobby && (
          <>
            {(reconnecting || hostLeft) && (
              <p
                role="status"
                className="rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm"
              >
                {hostLeft
                  ? "방장이 방을 나갔습니다"
                  : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
              </p>
            )}
            {isHost && (
              <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
                <p className="text-sm">친구에게 이 링크를 보내세요</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={link}
                    className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1.5 font-mono text-xs"
                  />
                  <ActionButton
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => void share()}
                  >
                    {copied ? "복사됨" : "보내기"}
                  </ActionButton>
                </div>
                {link && (
                  <div className="flex items-center gap-3">
                    <InviteQr url={link} size={120} />
                    <p className="text-xs leading-relaxed opacity-70">
                      휴대폰 카메라로 찍으면 바로 들어옵니다.
                      <br />방 코드 {roomCode}
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1">
              {isHost ? (
                <div className="flex flex-wrap items-center gap-1">
                  {[
                    ...RULE_PRESETS.map((p) => ({
                      key: p.id,
                      name: p.name,
                      code: p.code,
                      custom: false,
                    })),
                    ...customRules.map((r) => ({
                      key: `custom-${r.name}`,
                      name: r.name,
                      code: r.code,
                      custom: true,
                    })),
                  ].map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        const decoded = decodeRuleString(r.code);
                        if (decoded.ok)
                          onlineSession.host?.setRules(
                            decoded.rules,
                            r.custom ? r.name : undefined,
                          );
                      }}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        r.code === lobby.ruleCode
                          ? "border-amber-300 bg-white text-black"
                          : "border-white/15 bg-white/5",
                      )}
                    >
                      {r.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditingRules(true)}
                    className="rounded-full border border-white/30 border-dashed px-2 py-0.5 text-[11px]"
                  >
                    자세히 고치기
                  </button>
                </div>
              ) : (
                <p className="text-xs opacity-60">
                  {ruleName(lobby.ruleCode, lobby.ruleName)} ·{" "}
                  {lobby.seats.length}명
                </p>
              )}
              <FairLine
                lobby={lobby}
                isHost={isHost}
                setFair={(fair) => onlineSession.host?.setFair(fair)}
              />
              <p className="text-[11px] opacity-50">
                규칙 문자열{" "}
                <span className="select-all font-mono">{lobby.ruleCode}</span>
              </p>
              {lobby.seats.map((s) => (
                <div
                  key={s.seat}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                    s.kind === "bot" ? "bg-white/5 opacity-60" : "bg-white/10",
                  )}
                >
                  <span>
                    {s.name}
                    {s.kind === "host" && (
                      <span className="ml-2 rounded bg-amber-400 px-1 text-[10px] text-black">
                        방장
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-xs opacity-70">
                    {s.kind === "bot"
                      ? "빈자리 · 컴퓨터"
                      : s.connected
                        ? "들어옴"
                        : "연결 끊김"}
                    {isHost && s.kind === "guest" && (
                      <button
                        type="button"
                        onClick={() => onlineSession.host?.kick(s.seat)}
                        className="rounded bg-white/10 px-1.5 py-0.5 hover:bg-red-500/60"
                      >
                        내보내기
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <ChatBox
              mySeat={isHost ? 0 : (onlineSession.guest?.seat ?? null)}
            />
            {isHost ? (
              <ActionButton
                className="py-3 text-base"
                disabled={starting}
                onClick={() => void start()}
              >
                {starting ? "시작하는 중…" : "시작하기"}
              </ActionButton>
            ) : (
              <p className="text-center text-sm opacity-80">
                방장이 시작하기를 기다리는 중…
              </p>
            )}
          </>
        )}

        {phase === "kicked" && (
          <p className="text-center text-sm">방장이 대기실에서 내보냈습니다.</p>
        )}
        {phase === "full" && (
          <p className="text-center text-sm">
            자리가 다 찼거나 이미 시작한 방입니다.
          </p>
        )}
        {phase === "error" && (
          <p className="text-center text-red-300 text-sm">
            연결하지 못했습니다: {error}
          </p>
        )}

        <a
          href="/security"
          target="_blank"
          rel="noreferrer"
          className="text-center text-xs text-sky-300 underline opacity-80"
        >
          이 방은 어떻게 지켜지나요?
        </a>
        <button
          type="button"
          onClick={onBack}
          className="text-center text-xs underline opacity-70"
        >
          처음으로
        </button>
      </div>
      {editingRules && lobby && isHost && (
        <RuleEditor
          initial={(() => {
            const decoded = decodeRuleString(lobby.ruleCode);
            return decoded.ok ? decoded.rules : rules;
          })()}
          onClose={() => setEditingRules(false)}
          onApply={(next) => {
            onlineSession.host?.setRules(
              next,
              customName(encodeRuleString(next)),
            );
            setEditingRules(false);
          }}
        />
      )}
    </main>
  );
}
