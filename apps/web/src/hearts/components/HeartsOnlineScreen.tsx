"use client";

import { type HeartsRules, PLAYER_COUNT } from "@mighty/hearts-engine";
import { useEffect, useRef, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import {
  announceRoundVerified,
  bindFair,
  FairLine,
  reportIncident,
} from "@/components/FairLine";
import { InviteQr } from "@/components/InviteQr";
import { ActionButton } from "@/components/panels/common";
import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import { recordAudit } from "@/net/audit-history";
import { useChat } from "@/net/chat";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
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
  onBack,
  onPlaying,
}: {
  rules: HeartsRules;
  roomFromUrl: string | null;
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
  const [roomCode] = useState(() => roomFromUrl ?? randomId(16));
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방장 공개 열쇠 지문. 초대 링크에 넣는다 */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const isHost = roomFromUrl === null;
  const started = useRef(false);

  useEffect(() => {
    if (savedName && !name) setName(savedName);
  }, [savedName, name]);

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
    useHearts.setState({ offlineSeats: offlineSeatsOf(l) });
  };

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await openTransport(roomCode);
      if (isHost) {
        const host = new HostRoom({
          kit: heartsKit,
          transport,
          hostName: trimmed,
          rules,
          bot: heartsBotFor(useHeartsSettings.getState().level),
          botLevel: useHeartsSettings.getState().level,
          botNames: useSettings.getState().botNames,
          pace: (next) => setTimeout(next, 0),
          ...(useSettings.getState().fairPlay
            ? { fair: { group: "2048" as const } }
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
        setPhase("lobby");
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
        guest.on("match", (match) => {
          if (started.current) return;
          started.current = true;
          attachOnline(
            match,
            seatNamesOf(
              guest.lobby ?? { seats: [], ruleCode: "", started: true },
            ),
            { network: true },
          );
          bindFair(useHearts, guest.fair?.coordinator, null);
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
      attachOnline(match, seatNamesOf(host.lobby()), { network: true });
      bindFair(useHearts, host.fair?.coordinator, () => host.abandon());
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
        await navigator.share({ title: "하트 한 판 하자", url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // 공유 창을 닫은 경우
    }
  };

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
            <ActionButton
              className="py-3 text-base"
              onClick={() => void enter()}
            >
              {isHost ? "방 만들기" : "들어가기"}
            </ActionButton>
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
                <div className="flex items-center gap-3">
                  <InviteQr url={link} size={120} />
                  <p className="text-xs opacity-70">
                    휴대폰 카메라로 찍으면 바로 들어옵니다.
                    <br />방 코드 {roomCode}
                  </p>
                </div>
              </div>
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
