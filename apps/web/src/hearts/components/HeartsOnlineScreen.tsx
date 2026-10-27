"use client";

import { type HeartsRules, PLAYER_COUNT } from "@mighty/hearts-engine";
import { useEffect, useRef, useState } from "react";
import { ChatBox } from "@/components/ChatBox";
import { ConnectingNotice } from "@/components/ConnectingNotice";
import {
  announceRoundVerified,
  bindFair,
  endVoteOf,
  FairLine,
  RoomKindPicker,
  reportIncident,
} from "@/components/FairLine";
import { InviteLink } from "@/components/InviteLink";
import { ActionButton } from "@/components/panels/common";
import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import { recordAudit } from "@/net/audit-history";
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
  openTransport,
  saveSeatToken,
  testVoteDelayMs,
} from "@/net/session";
import { randomId } from "@/net/transport";
import { type ArchiveSource, saveGuestArchive } from "@/review/recorder";

import { heartsBotFor } from "../bots";
import { heartsKit } from "../kit";
import { heartsSession } from "../session";
import { useHeartsSettings } from "../settings";
import { useHearts } from "../store";

type Phase = "name" | "connecting" | "lobby" | "full" | "kicked" | "error";

function seatNamesOf(lobby: LobbyState): string[] {
  return lobby.seats.map((s) => s.name);
}

function offlineSeatsOf(lobby: LobbyState): number[] {
  return lobby.seats
    .filter((s) => s.kind === "guest" && !s.connected)
    .map((s) => s.seat);
}

/** 다함께 하트: 방장은 방을 만들어 링크를 보내고, 참가자는 링크로 들어온다 */
export function HeartsOnlineScreen({
  rules,
  roomFromUrl,
  resume,
  onBack,
  onPlaying,
}: {
  rules: HeartsRules;
  roomFromUrl: string | null;
  /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
  resume?: { room: string; restore: HostRestore };
  onBack: () => void;
  onPlaying: () => void;
}) {
  const savedName = useSettings((s) => s.playerName);
  const setPlayerName = useSettings((s) => s.setPlayerName);
  const attachOnline = useHearts((s) => s.attachOnline);
  const setSeatNames = useHearts((s) => s.setSeatNames);
  const reconnecting = useHearts((s) => s.reconnecting);
  const hostLeft = useHearts((s) => s.hostLeft);
  const [name, setName] = useState(savedName);
  const [phase, setPhase] = useState<Phase>("name");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [roomCode] = useState(
    () => roomFromUrl ?? resume?.room ?? randomId(16),
  );
  /** 온라인 대국: 내 기록에 남긴다(같은 방은 같은 대국이라 새로고침해도 같은 판을 두 번 남기지 않는다) */
  const onlineOptions = {
    network: true,
    stats: {
      game: "hearts",
      mode: "online" as const,
      key: `online:${roomCode}`,
    },
  };
  /** 방장: 복기용 기록은 방이 내준다(멘탈 포커 판이면 판별 실제 패까지) */
  const hostOptions = (host: {
    archiveSource(): ArchiveSource | null;
    lobby(): LobbyState;
  }) => ({
    ...onlineOptions,
    archive: {
      game: "hearts",
      mode: "online" as const,
      key: `online:${roomCode}`,
      seat: 0,
      seatNames: seatNamesOf(host.lobby()),
      source: () => host.archiveSource(),
    },
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방장 공개 열쇠 지문. 초대 링크에 넣는다 */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const isHost = roomFromUrl === null;
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
      if (failure) useHearts.setState({ invalid: failure });
      recordAudit(roomCode, failure);
    }
  };

  const syncLobby = (l: LobbyState) => {
    setLobby(l);
    setSeatNames(seatNamesOf(l));
    useHearts.setState({
      offlineSeats: offlineSeatsOf(l),
      endVote: endVoteOf(l),
    });
  };

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await openTransport(roomCode, {
        role: isHost ? "host" : "guest",
        game: "hearts",
      });
      if (isHost) {
        const host = new HostRoom({
          kit: heartsKit,
          transport,
          hostName: resume?.restore.saved.hostName ?? trimmed,
          rules,
          store: sessionHostStore(roomCode),
          ...(resume ? { restore: resume.restore } : {}),
          bot: heartsBotFor(useHeartsSettings.getState().level),
          botLevel: useHeartsSettings.getState().level,
          botNames: useSettings.getState().botNames,
          pace: (next) => setTimeout(next, 0),
          ...testVoteDelayMs(),
          ...(useSettings.getState().fairPlay
            ? { fair: { group: "r255" as const } }
            : {}),
        });
        heartsSession.host = host;
        setFingerprint(await host.fingerprint());
        useChat.getState().reset();
        useChat.setState({ send: (text) => host.chat(text) });
        host.onChat((m) => useChat.getState().receive(m));
        host.onReport((r) => onAuditReport(r.name, r.ok, r.reason));
        host.onIncident((n) =>
          reportIncident(n, seatNamesOf(host.lobby()), useHearts),
        );
        host.onOwnError((error) => useHearts.setState({ notice: error }));
        host.onLobby(syncLobby);
        setHostingRoom("hearts", roomCode);
        setPhase("lobby");
        if (host.match) {
          started.current = true;
          attachOnline(
            host.match,
            seatNamesOf(host.lobby()),
            hostOptions(host),
          );
          bindFair(
            useHearts,
            host.fair?.coordinator,
            () => host.abandon(),
            (end) => host.vote(end),
          );
          onPlaying();
        }
      } else {
        const saved = loadSeatToken(roomCode);
        const guest = new GuestRoom({
          kit: heartsKit,
          transport,
          name: trimmed,
          token: saved?.token ?? null,
          ...(saved ? { secret: saved.secret } : {}),
          ...(hostFingerprintFromUrl()
            ? { hostFingerprint: hostFingerprintFromUrl() as string }
            : {}),
          fairStore: fairStoreFor(roomCode),
        });
        heartsSession.guest = guest;
        useChat.getState().reset();
        useChat.setState({ send: (text) => guest.chat(text) });
        guest.on("chat", (m) => useChat.getState().receive(m));
        guest.on("seat", (_seat, token) =>
          saveSeatToken(roomCode, { token, secret: guest.secret }),
        );
        guest.on("lobby", (l) => {
          syncLobby(l);
          setPhase("lobby");
        });
        guest.on("full", () => setPhase("full"));
        guest.on("kicked", () => setPhase("kicked"));
        guest.on("hostLeft", () =>
          useHearts.setState({ hostLeft: true, reconnecting: false }),
        );
        guest.on("connection", (state) =>
          useHearts.setState({ reconnecting: state === "reconnecting" }),
        );
        guest.on("rejected", (e) => {
          useHearts.setState({ notice: e });
          if (e === "다른 게임의 방입니다") {
            setError(e);
            setPhase("error");
          }
        });
        guest.on("audit", (result) => {
          useHearts.setState({
            audit: result,
            notice: result.ok
              ? "공정성 확인: 섞기와 진행에 문제가 없습니다"
              : `공정성 확인 실패: ${result.reason}`,
          });
          onAuditReport("나", result.ok, result.ok ? undefined : result.reason);
        });
        guest.on("report", (r) => onAuditReport(r.name, r.ok, r.reason));
        guest.on("incident", (n) =>
          reportIncident(
            n,
            seatNamesOf(
              guest.lobby ?? { seats: [], ruleCode: "", started: true },
            ),
            useHearts,
          ),
        );
        guest.on("roundVerified", announceRoundVerified);
        // 판 검증(멘탈 포커)·게임 끝 검증을 통과할 때마다 복기용으로 남긴다.
        guest.on("archive", (source) => {
          const view = guest.match?.current();
          saveGuestArchive(
            {
              game: "hearts",
              mode: "online",
              key: `online:${roomCode}`,
              seat: guest.seat ?? 0,
              seatNames: seatNamesOf(
                guest.lobby ?? { seats: [], ruleCode: "", started: true },
              ),
            },
            source,
            view?.roundNumber ?? 0,
            view ? heartsKit.isOver(view as never) : false,
          );
        });
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
          bindFair(useHearts, guest.fair?.coordinator, null, (end) =>
            guest.vote(end),
          );
          onPlaying();
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const start = async () => {
    const host = heartsSession.host;
    if (!host || starting) return;
    setStarting(true);
    try {
      const match = await host.start();
      attachOnline(match, seatNamesOf(host.lobby()), hostOptions(host));
      bindFair(
        useHearts,
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur">
        <h2 className="text-center font-bold text-lg">
          ♥ {isHost ? "하트 방 만들기" : "초대받은 하트 방에 들어가기"}
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
                {PLAYER_COUNT}명. 빈자리는 컴퓨터가 채웁니다. 끝 점수{" "}
                {rules.endScore}점.
              </p>
            )}
            {isHost && <RoomKindPicker />}
            <ActionButton
              className="py-3 text-base"
              onClick={() => void enter()}
            >
              {isHost ? "방 만들기" : "들어가기"}
            </ActionButton>
          </>
        )}

        {phase === "connecting" && <ConnectingNotice isHost={isHost} />}

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
              <InviteLink
                link={link}
                roomCode={roomCode}
                shareTitle="하트 한 판 하자"
              />
            )}
            <FairLine
              lobby={lobby}
              isHost={isHost}
              setFair={(fair) => heartsSession.host?.setFair(fair)}
            />
            <p className="text-[11px] opacity-50">
              규칙 문자열{" "}
              <span className="select-all font-mono">{lobby.ruleCode}</span>
            </p>
            <div className="flex flex-col gap-1">
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
                        onClick={() => heartsSession.host?.kick(s.seat)}
                        className="rounded bg-white/10 px-1.5 py-0.5"
                      >
                        내보내기
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <ChatBox mySeat={null} />
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

        {phase === "full" && (
          <p className="text-center text-sm">
            자리가 다 찼거나 이미 시작한 방입니다.
          </p>
        )}
        {phase === "kicked" && (
          <p className="text-center text-sm">방장이 방에서 내보냈습니다.</p>
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
        <p className="text-center text-[11px] leading-relaxed opacity-50">
          연결 문제를 고치려고 연결에 걸린 시간을 서버에 보냅니다(패·이름·채팅은
          보내지 않습니다)
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-center text-xs underline opacity-70"
        >
          처음으로
        </button>
      </div>
    </main>
  );
}
