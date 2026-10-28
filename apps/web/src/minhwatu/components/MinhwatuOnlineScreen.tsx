"use client";

import { minhwatuBotFor } from "@mighty/minhwatu-ai";
import type { MinhwatuRules } from "@mighty/minhwatu-engine";
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
import { useSettings } from "@/game/settings";
import { useHwatuFair } from "@/hwatu/fair-bar";
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
} from "@/net/session";
import { randomId } from "@/net/transport";
import { saveGuestArchive } from "@/review/recorder";

import { minhwatuKit } from "../kit";
import { describeRules } from "../rules-text";
import { type MinhwatuHostRoom, minhwatuSession } from "../session";
import { useMinhwatu } from "../store";

type Phase = "name" | "connecting" | "lobby" | "full" | "kicked" | "error";

/** 끊긴 사람 대신 컴퓨터가 내기까지 기다리는 시간 */
const STAND_IN_MS = 30_000;

function seatNamesOf(lobby: LobbyState): string[] {
  return lobby.seats.map((s) => s.name);
}

function offlineSeatsOf(lobby: LobbyState): number[] {
  return lobby.seats
    .filter((s) => s.kind === "guest" && !s.connected)
    .map((s) => s.seat);
}

/** 친구와 민화투: 방장은 방을 만들어 링크를 보내고, 친구는 링크로 들어온다 */
export function MinhwatuOnlineScreen({
  rules,
  roomFromUrl,
  resume,
  onBack,
  onPlaying,
}: {
  rules: MinhwatuRules;
  roomFromUrl: string | null;
  /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
  resume?: { room: string; restore: HostRestore };
  onBack: () => void;
  onPlaying: () => void;
}) {
  const savedName = useSettings((s) => s.playerName);
  const setPlayerName = useSettings((s) => s.setPlayerName);
  const attachOnline = useMinhwatu((s) => s.attachOnline);
  const setSeatNames = useMinhwatu((s) => s.setSeatNames);
  const reconnecting = useMinhwatu((s) => s.reconnecting);
  const hostLeft = useMinhwatu((s) => s.hostLeft);
  const [name, setName] = useState(savedName);
  const [phase, setPhase] = useState<Phase>("name");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [roomCode] = useState(
    () => roomFromUrl ?? resume?.room ?? randomId(16),
  );
  const stats = {
    game: "minhwatu",
    mode: "online" as const,
    key: `online:${roomCode}`,
  };
  /** 방장: 복기용 기록은 방이 내준다 */
  const hostArchive = (host: MinhwatuHostRoom) => ({
    ...stats,
    seat: 0,
    seatNames: seatNamesOf(host.lobby()),
    source: () => host.archiveSource(),
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  /** 게임 끝 검증 결과를 채팅에 남긴다. 무효 표시는 내 기기의 검증만 따른다(HeartsOnlineScreen과 같다) */
  const onAuditReport = (who: string, ok: boolean, reason?: string) => {
    const own = who === "나";
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
      if (!ok)
        useMinhwatu.setState({ notice: `기록 검증 실패: ${reason ?? ""}` });
      recordAudit(roomCode, ok ? null : `${who}: ${reason ?? ""}`);
    }
  };

  const syncLobby = (l: LobbyState) => {
    setLobby(l);
    setSeatNames(seatNamesOf(l));
    useMinhwatu.setState({ offlineSeats: offlineSeatsOf(l) });
    useHwatuFair.setState({
      endVote: endVoteOf(l),
      names: seatNamesOf(l),
      offline: offlineSeatsOf(l),
    });
  };

  /** 방장: 암호화방이면 섞는 중·부정 알림·끝내기를 화면에 잇는다 */
  const bindHost = (host: MinhwatuHostRoom) =>
    bindFair(
      useHwatuFair,
      host.fair?.coordinator,
      () => host.abandon(),
      (end) => host.vote(end),
    );

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await openTransport(roomCode, {
        role: isHost ? "host" : "guest",
        game: "minhwatu",
      });
      if (isHost) {
        const host = new HostRoom({
          kit: minhwatuKit,
          transport,
          hostName: resume?.restore.saved.hostName ?? trimmed,
          rules,
          store: sessionHostStore(roomCode),
          ...(resume ? { restore: resume.restore } : {}),
          bot: minhwatuBotFor(1),
          botLevel: 1,
          botNames: useSettings.getState().botNames,
          standInDelayMs: STAND_IN_MS,
          pace: (next) => setTimeout(next, 0),
          ...(useSettings.getState().fairPlay
            ? { fair: { group: "r255" as const } }
            : {}),
        });
        minhwatuSession.host = host;
        setFingerprint(await host.fingerprint());
        useChat.getState().reset();
        useChat.setState({ send: (text) => host.chat(text) });
        host.onChat((m) => useChat.getState().receive(m));
        host.onReport((r) => onAuditReport(r.name, r.ok, r.reason));
        host.onOwnError((e) => useMinhwatu.setState({ notice: e }));
        host.onIncident((n) =>
          reportIncident(n, seatNamesOf(host.lobby()), useHwatuFair),
        );
        host.onLobby(syncLobby);
        setHostingRoom("minhwatu", roomCode);
        setPhase("lobby");
        if (host.match) {
          started.current = true;
          attachOnline(
            host.match,
            seatNamesOf(host.lobby()),
            stats,
            hostArchive(host),
          );
          bindHost(host);
          onPlaying();
        }
      } else {
        const saved = loadSeatToken(roomCode);
        const guest = new GuestRoom({
          kit: minhwatuKit,
          transport,
          name: trimmed,
          token: saved?.token ?? null,
          ...(saved ? { secret: saved.secret } : {}),
          ...(hostFingerprintFromUrl()
            ? { hostFingerprint: hostFingerprintFromUrl() as string }
            : {}),
          fairStore: fairStoreFor(roomCode),
        });
        minhwatuSession.guest = guest;
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
          useMinhwatu.setState({ hostLeft: true, reconnecting: false }),
        );
        guest.on("connection", (state) =>
          useMinhwatu.setState({ reconnecting: state === "reconnecting" }),
        );
        guest.on("rejected", (e) => {
          useMinhwatu.setState({ notice: e });
          if (e === "다른 게임의 방입니다") {
            setError(e);
            setPhase("error");
          }
        });
        guest.on("audit", (result) => {
          useMinhwatu.setState({
            notice: result.ok
              ? "기록 확인: 진행에 문제가 없습니다"
              : `기록 확인 실패: ${result.reason}`,
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
            useHwatuFair,
          ),
        );
        guest.on("roundVerified", announceRoundVerified);
        // 게임 끝 검증을 통과하면 복기용으로 남긴다.
        guest.on("archive", (source) => {
          const view = guest.match?.current();
          saveGuestArchive(
            {
              ...stats,
              seat: guest.seat ?? 0,
              seatNames: seatNamesOf(
                guest.lobby ?? { seats: [], ruleCode: "", started: true },
              ),
            },
            source,
            view?.roundNumber ?? 0,
            view ? minhwatuKit.isOver(view) : false,
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
            stats,
          );
          bindFair(useHwatuFair, guest.fair?.coordinator, null, (end) =>
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
    const host = minhwatuSession.host;
    if (!host || starting) return;
    setStarting(true);
    try {
      const match = await host.start();
      attachOnline(match, seatNamesOf(host.lobby()), stats, hostArchive(host));
      bindHost(host);
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
  const friendIn = lobby?.seats.some((s) => s.kind === "guest") ?? false;

  return (
    <main
      data-game="center"
      className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)] p-4 text-white"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl">
        <h2 className="text-center font-bold text-lg">
          {isHost ? "민화투 방 만들기" : "초대받은 민화투 방에 들어가기"}
        </h2>

        {phase === "name" && (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              내 이름
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                placeholder="친구에게 보일 이름"
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2"
              />
            </label>
            {isHost && (
              <p className="text-white/60 text-xs">
                {describeRules(rules)}. 빈자리는 컴퓨터(중수)가 앉고, 첫 판 선은
                무작위, 그 뒤로는 앞 판 1등이 선입니다.
              </p>
            )}
            {isHost && <RoomKindPicker />}
            <button
              type="button"
              onClick={() => void enter()}
              className="rounded-xl bg-amber-300 py-3 font-semibold text-black"
            >
              {isHost ? "방 만들기" : "들어가기"}
            </button>
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
                shareTitle="민화투 한 판 치자"
              />
            )}
            <FairLine
              lobby={lobby}
              isHost={isHost}
              setFair={(fair) => minhwatuSession.host?.setFair(fair)}
            />
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
                      ? "컴퓨터(친구가 들어오면 바뀜)"
                      : s.connected
                        ? "들어옴"
                        : "연결 끊김"}
                    {isHost && s.kind === "guest" && (
                      <button
                        type="button"
                        onClick={() => minhwatuSession.host?.kick(s.seat)}
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
              <button
                type="button"
                disabled={starting || !friendIn}
                onClick={() => void start()}
                className="rounded-xl bg-amber-300 py-3 font-semibold text-black disabled:opacity-40"
              >
                {starting
                  ? "시작하는 중…"
                  : friendIn
                    ? "시작하기"
                    : "친구가 들어오면 시작할 수 있어요"}
              </button>
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

        <p className="text-center text-[11px] leading-relaxed opacity-50">
          서버 없이 기기끼리 바로 잇습니다. 연결 문제를 고치려고 연결에 걸린
          시간을 서버에 보냅니다(패·이름·채팅은 보내지 않습니다)
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
