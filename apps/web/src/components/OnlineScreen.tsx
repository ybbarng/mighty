"use client";

import { encodeRuleString, RULE_PRESETS, type RuleSet } from "@mighty/engine";
import { useEffect, useRef, useState } from "react";

import { botFor, browserPace } from "@/game/bots";
import { useSettings } from "@/game/settings";
import { useGame } from "@/game/store";
import { cn } from "@/lib/cn";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import type { LobbyState } from "@/net/protocol";
import {
  inviteUrl,
  loadSeatToken,
  onlineSession,
  openTransport,
  saveSeatToken,
} from "@/net/session";
import { randomId } from "@/net/transport";

import { Logo } from "./brand/Logo";
import { InviteQr } from "./InviteQr";
import { ActionButton } from "./panels/common";

type Phase = "name" | "connecting" | "lobby" | "full" | "kicked" | "error";

function ruleName(code: string): string {
  return RULE_PRESETS.find((p) => p.code === code)?.name ?? "직접 정한 규칙";
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
  onBack,
  onPlaying,
}: {
  rules: RuleSet;
  /** 초대 링크로 들어왔으면 방 코드 */
  roomFromUrl: string | null;
  onBack: () => void;
  onPlaying: () => void;
}) {
  const savedName = useSettings((s) => s.playerName);
  const setPlayerName = useSettings((s) => s.setPlayerName);
  const attachOnline = useGame((s) => s.attachOnline);
  const setSeatNames = useGame((s) => s.setSeatNames);
  const [name, setName] = useState(savedName);
  const [phase, setPhase] = useState<Phase>("name");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [roomCode] = useState(() => roomFromUrl ?? randomId(6));
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = roomFromUrl === null;
  const started = useRef(false);

  useEffect(() => {
    if (savedName && !name) setName(savedName);
  }, [savedName, name]);

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await openTransport(roomCode);
      if (isHost) {
        const host = new HostRoom({
          transport,
          hostName: trimmed,
          rules,
          bot: botFor(useSettings.getState().botLevel),
          pace: browserPace,
        });
        onlineSession.host = host;
        host.onLobby((l) => {
          setLobby(l);
          setSeatNames(seatNamesOf(l));
        });
        setPhase("lobby");
      } else {
        const saved = loadSeatToken(roomCode);
        const guest = new GuestRoom({
          transport,
          name: trimmed,
          token: saved?.token ?? null,
          ...(saved ? { secret: saved.secret } : {}),
        });
        onlineSession.guest = guest;
        guest.on("seat", (_seat, token) =>
          saveSeatToken(roomCode, { token, secret: guest.secret }),
        );
        guest.on("lobby", (l) => {
          setLobby(l);
          setPhase("lobby");
          setSeatNames(seatNamesOf(l));
        });
        guest.on("full", () => setPhase("full"));
        guest.on("kicked", () => setPhase("kicked"));
        guest.on("hostLeft", () => useGame.setState({ hostLeft: true }));
        guest.on("rejected", (e) => useGame.setState({ notice: e }));
        guest.on("audit", (result) =>
          useGame.setState({
            audit: result,
            notice: result.ok
              ? "공정성 확인: 섞기와 진행에 문제가 없습니다"
              : `공정성 확인 실패: ${result.reason}`,
          }),
        );
        guest.on("match", (match) => {
          if (started.current) return;
          started.current = true;
          attachOnline(
            match,
            seatNamesOf(
              guest.lobby ?? { seats: [], ruleCode: "", started: true },
            ),
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
    const host = onlineSession.host;
    if (!host || starting) return;
    setStarting(true);
    try {
      const match = await host.start();
      attachOnline(match, seatNamesOf(host.lobby()));
      onPlaying();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const link = typeof window === "undefined" ? "" : inviteUrl(roomCode);
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
          </>
        )}

        {phase === "connecting" && (
          <p className="text-center text-sm opacity-80">
            {isHost ? "방을 여는 중…" : "방장을 찾는 중… 잠시만 기다려 주세요"}
          </p>
        )}

        {phase === "lobby" && lobby && (
          <>
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
                <div className="flex flex-wrap gap-1">
                  {RULE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onlineSession.host?.setRules(p.rules)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        p.code === lobby.ruleCode
                          ? "border-amber-300 bg-white text-black"
                          : "border-white/15 bg-white/5",
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs opacity-60">
                  {ruleName(lobby.ruleCode)} · {lobby.seats.length}명
                </p>
              )}
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
