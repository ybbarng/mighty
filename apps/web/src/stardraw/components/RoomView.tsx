"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import {
  drandRoundForClose,
  drandTime,
  type EntrantSigner,
  fromBase64Url,
  type RoundRecord,
  registrationProofMessage,
  roundTimes,
  type Ticket,
} from "@mighty/stardraw-core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "../astronaut/Avatar";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { errorText } from "../errors";
import { ensureRegistered, registering } from "../registrar";
import { drawOrder } from "../results";
import {
  ROOM_TEXT_MAX,
  RoomClient,
  type RoomEvent,
  type RoomPerson,
  type RoomPicks,
  roomCharCount,
  savedPass,
} from "../room-client";
import { roomPhase } from "../room-phase";
import { LIVE_LEAD_MS, LIVE_ROULETTE_TIMING, planRoulette } from "../roulette";
import { roundTitle } from "../round-label";
import { type Services, serverApi } from "../services";
import { starOf } from "../sky";
import type { KeyInfo } from "../wallet";
import { IssuedView, useAstronautSetup, WelcomeFlyer } from "./AstronautSetup";
import { DrawView } from "./DrawView";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { formatLeft } from "./parts";
import { SkyBoard } from "./SkyBoard";

/**
 * 회차 방(docs/36 11-23, docs/06): 밤하늘을 보러 모인 사람들. 위쪽은 밤하늘(추첨도 여기)과 진행 상태 한 줄,
 * 아래는 언덕 위에 모여 앉은 우주인 얼굴들. 말은 그 얼굴에서 풍등처럼 떠올라 흐려진다(남기지 않는다).
 * 추첨은 서버 시각 기준으로 모두 같은 장면(방송처럼): 시작 = 추첨 시각 + LIVE_LEAD_MS, 15초 전 안내, 10초 카운트다운
 */

/** 언덕에 보이는 얼굴 수(넘으면 +n) */
const FACES = 12;
/** 동시에 떠 있는 풍등 수 */
const LANTERNS = 6;
const LANTERN_MS = 7000;

interface Lantern {
  key: string;
  id: string;
  from: string;
  text: string;
  /** 말한 얼굴의 가로 자리(하늘 판 기준 px) */
  x: number;
  /** 떠오르기 시작하는 높이 줄(0~3). 가까운 풍등과 같은 줄을 쓰지 않는다 */
  lane: number;
  /** 띄운 시각(ms) */
  at: number;
  hidden?: boolean;
}

/** 풍등이 다른 풍등과 겹치지 않을 만큼 위로 떠오르는 시간(ms)과 가로로 떨어져야 하는 거리(px) */
const LANTERN_CLEAR_MS = 1700;
const LANTERN_GAP = 220;
/** 하늘 판 가장자리 여백(px) */
const LANTERN_EDGE = 6;
/** 풍등을 길게 누르는 시간(ms) */
const HOLD_MS = 500;

/**
 * 풍등 하나: 그 얼굴 위에서 떠오른다. 폭을 재서 하늘 판 안쪽으로 밀어 넣고(가장자리 얼굴이면 안쪽으로), 꼬리는 얼굴 쪽을 가리킨다
 */
function LanternBubble({
  lantern,
  onHold,
}: {
  lantern: Lantern;
  /** 길게 누름(신고·국장 조치). 없으면 누를 수 없다 */
  onHold?: ((l: Lantern) => void) | undefined;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const hold = useRef(0);
  const press = onHold
    ? {
        onPointerDown: () => {
          window.clearTimeout(hold.current);
          hold.current = window.setTimeout(() => onHold(lantern), HOLD_MS);
        },
        onPointerUp: () => window.clearTimeout(hold.current),
        onPointerLeave: () => window.clearTimeout(hold.current),
        onPointerCancel: () => window.clearTimeout(hold.current),
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          window.clearTimeout(hold.current);
          onHold(lantern);
        },
      }
    : {};
  const [place, setPlace] = useState<{ left: number; tail: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const w = el.offsetWidth;
    const W = parent.clientWidth;
    const left = Math.min(
      Math.max(lantern.x - w / 2, LANTERN_EDGE),
      Math.max(LANTERN_EDGE, W - w - LANTERN_EDGE),
    );
    setPlace({ left, tail: Math.min(Math.max(lantern.x - left, 14), w - 14) });
  }, [lantern.x]);
  return (
    <span
      ref={ref}
      data-lantern={lantern.from}
      {...press}
      className={cn(
        "sd-lantern absolute w-max max-w-[calc(100%-12px)] select-none break-keep rounded-2xl bg-amber-100/90 px-3 py-1.5 text-center text-slate-900 text-sm shadow-[0_0_24px_rgba(255,214,140,0.45)]",
        onHold && "pointer-events-auto [-webkit-touch-callout:none]",
      )}
      style={{
        left: place ? place.left : lantern.x,
        bottom: `${0.75 + lantern.lane * 2.75}rem`,
        visibility: place ? undefined : "hidden",
      }}
    >
      {lantern.text}
      {/* 꼬리: 말한 얼굴 쪽 */}
      <span
        aria-hidden="true"
        className="absolute top-full size-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[7px] border-t-amber-100/90"
        style={{ left: place?.tail ?? 14 }}
      />
    </span>
  );
}

interface Spark {
  key: string;
  kind: "twinkle" | "meteor";
  to: string | null;
  x: number;
}

/** 방 안 시계: 서버 시각에 맞춘다 */
function roomClock(client: RoomClient): Clock {
  return { now: () => client.serverNow(), after: realClock.after };
}

export function RoomView({
  services,
  round,
  record,
  ticket,
  onClose,
  onEnter,
}: {
  services: Services;
  round: number;
  record: RoundRecord | null | undefined;
  ticket: Ticket | undefined;
  onClose: () => void;
  /** 다음 회차 응모(추첨 연출이 끝난 뒤에만 보인다) */
  onEnter: () => void;
}) {
  const base = serverApi() as string;
  const client = useMemo(() => new RoomClient(base, round), [base, round]);
  const clock = useMemo(() => roomClock(client), [client]);
  const schedule = services.ledger.schedule;
  const times = roundTimes(schedule, round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  const showStart = drawAt * 1000 + LIVE_LEAD_MS;
  const showLength = useMemo(
    () =>
      record
        ? planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING).totalMs
        : 46_000,
    [record],
  );

  const [people, setPeople] = useState<Map<string, RoomPerson>>(new Map());
  const [watchers, setWatchers] = useState(0);
  const [me, setMe] = useState<string | null>(null);
  const [pass, setPass] = useState<string | null>(
    () => savedPass(round)?.pass ?? null,
  );
  const [picks, setPicks] = useState<RoomPicks | null>(null);
  const [lanterns, setLanterns] = useState<Lantern[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [closed, setClosed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => client.serverNow());
  const order = useRef<string[]>([]);
  /** 떠 있는 풍등(길 고르기용, 상태와 같은 값) */
  const lanternsRef = useRef<Lantern[]>([]);
  /** 풍등 자리 예약(띄울 시각과 가로 자리) */
  const slots = useRef<{ x: number; at: number }[]>([]);
  const skyRef = useRef<HTMLDivElement>(null);

  // 시각(0.25초마다): 카운트다운·진행 상태
  useEffect(() => {
    const t = window.setInterval(() => setNow(client.serverNow()), 250);
    return () => window.clearInterval(t);
  }, [client]);

  // 스트림: 들어오면 얼굴(표가 있으면), 끊기면 2초 뒤 다시
  // biome-ignore lint/correctness/useExhaustiveDependencies: 표가 바뀔 때만 다시 연결
  useEffect(() => {
    let alive = true;
    let retry = 0;
    const onEvent = (e: RoomEvent) => {
      if (e.type === "hello") {
        setMe(e.me);
        setPeople(new Map(e.people.map((p) => [p.id, p])));
        order.current = e.people.map((p) => p.id);
        setWatchers(e.watchers);
        setPicks(e.picks);
        setProblem(null);
      } else if (e.type === "join") {
        setPeople((m) => new Map(m).set(e.person.id, e.person));
        order.current = [
          ...order.current.filter((i) => i !== e.person.id),
          e.person.id,
        ];
      } else if (e.type === "leave" || e.type === "kicked") {
        setPeople((m) => {
          const next = new Map(m);
          next.delete(e.id);
          return next;
        });
        if (e.type === "kicked" && e.id === me) setPass(null);
      } else if (e.type === "watchers") setWatchers(e.count);
      else if (e.type === "sealed") setPicks(e.picks);
      else if (e.type === "say") launch(e.id, e.from, e.text);
      else if (e.type === "hide") {
        lanternsRef.current = lanternsRef.current.map((x) =>
          x.id === e.id ? { ...x, hidden: true } : x,
        );
        setLanterns(lanternsRef.current);
      } else if (e.type === "cheer") spark(e.kind, e.to);
      else if (e.type === "closed") setClosed(true);
    };
    const open = () => {
      if (!alive) return;
      void client.listen(pass, onEvent, (err) => {
        if (!alive) return;
        if (err && err.status === 401 && pass) {
          setPass(null);
          return;
        }
        if (
          err &&
          (err.status === 409 || err.status === 410 || err.status === 404)
        ) {
          setProblem(err.message);
          if (err.status === 410) setClosed(true);
          return;
        }
        retry = window.setTimeout(open, 2000);
      });
    };
    open();
    return () => {
      alive = false;
      window.clearTimeout(retry);
      client.close();
    };
  }, [client, pass]);

  const xOf = (id: string) => {
    const i = order.current.indexOf(id);
    const shown = Math.min(order.current.length, FACES);
    if (i < 0 || i >= FACES) return 0.15 + Math.random() * 0.7;
    return (i + 0.5) / Math.max(shown, 1);
  };

  /** 말한 얼굴의 가로 자리(하늘 판 기준 px). 얼굴이 언덕에 보이지 않으면(+n) 하늘 가운데쯤 아무 자리 */
  const faceX = (id: string): number => {
    const sky = skyRef.current;
    const width = sky?.clientWidth ?? 360;
    const face = document.querySelector<HTMLElement>(`[data-face="${id}"]`);
    if (!sky || !face) return width * (0.2 + Math.random() * 0.6);
    const s = sky.getBoundingClientRect();
    const f = face.getBoundingClientRect();
    return f.left + f.width / 2 - s.left;
  };

  const launch = (id: string, from: string, text: string) => {
    const key = `${id}-${Math.random()}`;
    const x = faceX(from);
    const now = realClock.now();
    // 모두 같은 줄에서 같은 빠르기로 떠오르므로, 가로로 가까운 풍등이 한 칸 위로 비켜날 때까지만 기다렸다 띄운다
    // (기다리는 중인 풍등도 자리를 잡아 둔다). 그래서 위아래로도 옆으로도 겹치지 않는다
    const near = slots.current.filter(
      (s) => s.at > now - LANTERN_CLEAR_MS && Math.abs(s.x - x) < LANTERN_GAP,
    );
    const at = Math.max(now, ...near.map((s) => s.at + LANTERN_CLEAR_MS));
    slots.current = [
      ...slots.current.filter((s) => s.at > now - LANTERN_CLEAR_MS),
      { x, at },
    ];
    realClock.after(at - now, () => {
      const next = [
        ...lanternsRef.current.filter((l) => l.from !== from),
        { key, id, from, text, x, lane: 0, at },
      ].slice(-LANTERNS);
      lanternsRef.current = next;
      setLanterns(next);
      realClock.after(LANTERN_MS, () => {
        lanternsRef.current = lanternsRef.current.filter((l) => l.key !== key);
        setLanterns(lanternsRef.current);
      });
    });
  };

  const spark = (kind: "twinkle" | "meteor", to: string | null) => {
    const key = `${kind}-${Math.random()}`;
    setSparks((s) =>
      [...s, { key, kind, to, x: to ? xOf(to) : Math.random() }].slice(-12),
    );
    realClock.after(2200, () =>
      setSparks((s) => s.filter((x) => x.key !== key)),
    );
  };

  // ---------------------------------------------------------------- 말하기·신분증

  const key = services.wallet.loadKey();
  const id = useIdPresent(services);
  const [nonce, setNonce] = useState<string | null>(null);
  const [registeringNow, setRegisteringNow] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendNote, setSendNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 이 기기 등록증의 서명자(미리 만들어 둔다, 누름 직후 바로 패스키를 열게) */
  const signerRef = useRef<EntrantSigner | null>(null);
  /** 방에서 막 등록·제시를 마쳤으면 이어서 방 입장 신분증 제시로 */
  const [continueAfterSetup, setContinueAfterSetup] = useState(false);
  const setup = useAstronautSetup(services, () => setContinueAfterSetup(true));

  // 등록증이 있고 표가 없으면 한 번 쓰는 값을 미리 받아 둔다(누른 그 순간 바로 패스키를 열게, 1분 30초마다 새로)
  const hasKey = key !== null;
  useEffect(() => {
    if (!hasKey || pass || closed) return;
    let alive = true;
    const fetchNonce = () =>
      client
        .challenge()
        .then((c) => alive && setNonce(c.nonce))
        .catch(() => alive && setNonce(null));
    void fetchNonce();
    const t = window.setInterval(fetchNonce, 90_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [client, hasKey, pass, closed]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 등록증이 생기거나 바뀔 때만
  useEffect(() => {
    signerRef.current = null;
    if (!key) return;
    let alive = true;
    void services.wallet.signerFor(key).then((s) => {
      if (alive) signerRef.current = s;
    });
    return () => {
      alive = false;
    };
  }, [hasKey, services]);

  /**
   * 장부에 아직 등록이 없는 등록증(방에서 막 발급했고 아직 응모하지 않음)이면, 신분증 제시 누름 안에서 등록 증명에 서명하고
   * 장부 등록을 올린다(docs/36 11-21: 우주인 등록은 패스키 하나, 장부 등록은 첫 응모나 방에서). 방은 등록한 우주인만
   * 말할 수 있어서다. 패스키 창은 누름 하나에 하나만 열 수 있어 방 입장 제시는 등록이 끝난 뒤 한 번 더 누른다
   */
  const registerFirst = async (k: KeyInfo): Promise<"ready" | "new" | null> => {
    const { ledger, wallet } = services;
    if (await ledger.isRegistered(k.pub)) return "ready";
    await registering(services, k)?.catch(() => null);
    if (await ledger.isRegistered(k.pub)) return "ready";
    if (!wallet.loadProof(k.pub)) {
      const signer = signerRef.current ?? (await wallet.signerFor(k));
      const proof = await id
        .run(
          () =>
            signer.sign(
              registrationProofMessage({
                v: 1,
                credentialId: k.credentialId,
                pub: k.pub,
              }),
            ),
          {
            verb: "제시",
            pub: k.pub,
            tap: true,
            done: `${residentPhrase(astronautOf(k.pub))} 님, 장부에 등록하겠습니다.`,
          },
        )
        .catch((err) => {
          setSendNote(errorText(err, "신분증을 확인"));
          return null;
        });
      if (!proof) return null;
      wallet.saveProof(k.pub, proof);
    }
    setRegisteringNow(true);
    try {
      const at = await ensureRegistered(services, k);
      if (at === null) setSendNote("장부에 등록하지 못했습니다.");
      return at === null ? null : "new";
    } catch (err) {
      setSendNote(errorText(err, "등록"));
      return null;
    } finally {
      setRegisteringNow(false);
    }
  };

  /** 입력 칸을 누름: 표가 없으면 신분증 제시(등록증 없으면 우주인 등록 신청서) */
  const ensurePass = async (): Promise<string | null> => {
    if (pass) return pass;
    if (!key) {
      void setup.create();
      return null;
    }
    setSendNote(null);
    const registered = await registerFirst(key);
    if (!registered) return null;
    // 한 번 쓰는 값과 서명자는 미리 준비해 둔다: 등록증을 누른 그 순간 사이에 기다림 없이 패스키를 연다(아이폰 사파리 누름 규칙).
    // 방금 장부 등록을 올렸으면 그사이 미리 받은 값이 낡았을 수 있어 새로 받는다
    const used: string =
      (registered === "ready" ? nonce : null) ??
      (await client.challenge().then((c) => c.nonce));
    setNonce(null);
    const signer = signerRef.current ?? (await services.wallet.signerFor(key));
    // 신분증 제시 틀(입구·응모와 같은 부품): 오버레이 → "패스키로 신분증을 제시해 주세요." → 등록증이 올라와 기다림 →
    // 누르거나 밀어 올리면 그 동작 직후 패스키 → 확인 → 인사 → 등록증이 내려가고 걷힘
    const got = await id
      .run(() => client.issuePass(signer, used), {
        verb: "제시",
        pub: key.pub,
        tap: true,
        done: `${residentPhrase(astronautOf(key.pub))} 님, 어서 오세요.`,
      })
      .catch((err) => {
        setSendNote(errorText(err, "방에 들어가", "방에 들어가지 않았어요"));
        return null;
      });
    if (!got) return null;
    setPass(got.pass);
    setMe(got.id);
    // 쓰던 말 그대로 입력 칸으로
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return got.pass;
  };

  // 방에서 막 등록(발급)·제시를 마쳤으면 이어서 방 입장 신분증 제시(등록증을 누르면 패스키)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 등록이 끝난 순간 한 번
  useEffect(() => {
    if (!continueAfterSetup || !key || pass) return;
    setContinueAfterSetup(false);
    void ensurePass();
  }, [continueAfterSetup, hasKey, pass]);

  const send = async () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text || !pass) return;
    try {
      await client.say(pass, text);
      setDraft("");
      setSendNote(null);
    } catch (err) {
      setSendNote(errorText(err, "말을 보내"));
    }
  };

  const cheer = (kind: "twinkle" | "meteor", to: string | null) => {
    if (!pass) return void ensurePass();
    void client.cheer(pass, kind, to).catch(() => {});
  };

  // ---------------------------------------------------------------- 신고·국장 조치

  /** 길게 누른 풍등(그 말과 말한 사람). 국장이면 조치 서명에 쓸 한 번 쓰는 값을 미리 받아 둔다 */
  const [menu, setMenu] = useState<{
    lantern: Lantern;
    nonce: string | null;
  } | null>(null);
  const director = me !== null && people.get(me)?.director === true;
  const openMenu = (l: Lantern) => {
    navigator.vibrate?.(15);
    setMenu({ lantern: l, nonce: null });
    if (director)
      void client
        .challenge()
        .then((c) =>
          setMenu((m) =>
            m?.lantern.key === l.key ? { ...m, nonce: c.nonce } : m,
          ),
        )
        .catch(() => {});
  };
  const report = async (l: Lantern) => {
    setMenu(null);
    if (!pass) return;
    try {
      await client.report(pass, l.id);
      setSendNote("신고했습니다.");
    } catch (err) {
      setSendNote(errorText(err, "신고"));
    }
  };
  const moderate = async (action: "hide" | "kick") => {
    const m = menu;
    const signer = signerRef.current;
    setMenu(null);
    if (!m?.nonce || !signer) return;
    try {
      await client.moderate(
        signer,
        m.nonce,
        action,
        action === "hide" ? m.lantern.id : m.lantern.from,
      );
    } catch (err) {
      setSendNote(
        errorText(
          err,
          action === "hide" ? "가리" : "내보내",
          "조치하지 않았어요",
        ),
      );
    }
  };

  // ---------------------------------------------------------------- 진행 상태

  const toShow = showStart - now;
  const phase = roomPhase(now, times.entryDeadline, showStart, showLength);
  const title = roundTitle(schedule, round);
  const statusLine =
    phase === "open"
      ? `지금 ${title} 응모를 받고 있어요.`
      : phase === "closed"
        ? `응모를 마감했어요. 추첨까지 ${formatLeft(toShow / 1000)}`
        : phase === "announce"
          ? "이제 추첨을 시작하겠습니다."
          : phase === "count"
            ? "이제 추첨을 시작하겠습니다."
            : phase === "live"
              ? `${title} 추첨 중이에요.`
              : closed
                ? "방을 닫았어요."
                : `${title} 추첨이 끝났어요.`;

  // 로컬 데모 바로가기로 왔으면: 이 방의 추첨이 끝난 뒤 잠깐 머물다(결과 이야기) 다음 추첨 회차 방으로
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계가 바뀔 때만
  useEffect(() => {
    if (phase !== "after") return;
    let follow = false;
    try {
      follow = sessionStorage.getItem(ROOM_FOLLOW_KEY) === "1";
    } catch {
      follow = false;
    }
    if (!follow) return;
    const t = window.setInterval(() => {
      const next = nextRoomRound(services, client.serverNow());
      if (next === null || next <= round) return;
      const times = roundTimes(services.ledger.schedule, next);
      const nextShow =
        drandTime(drandRoundForClose(times.closesAt)) * 1000 + LIVE_LEAD_MS;
      // 다음 추첨 2분 전이 되면 옮긴다(그 전에는 이 방에서 결과 이야기를 나눈다)
      if (nextShow - client.serverNow() < 120_000)
        window.location.replace(`/stardraw/rounds#draw-${next}`);
    }, 2000);
    return () => window.clearInterval(t);
  }, [phase, round]);

  const visible = order.current.filter((i) => people.has(i));
  const faces = visible.slice(0, FACES);
  const more = visible.length - faces.length;
  const lit = new Set<number>();
  // 방송 중인 장면의 켜진 별(그 별을 고른 사람의 얼굴이 빛난다)
  if (record && (phase === "live" || phase === "after")) {
    const plan = planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING);
    for (const s of plan.stops)
      if (now - showStart >= s.at + LIVE_ROULETTE_TIMING.spinMs)
        lit.add(s.target);
  }
  const glowing = (pid: string) =>
    (picks?.byPerson[pid] ?? []).some((n) => lit.has(n));
  const popular = picks
    ? Object.entries(picks.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, c]) => `${starOf(Number(n)).ko} ${c}명`)
    : [];

  return (
    <section
      aria-label={`${title} 방`}
      data-room={round}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 돌아가기
        </button>
        <span className="text-white/55 text-xs tabular-nums" data-room-count>
          함께 보는 {people.size + watchers}명
        </span>
      </div>

      <p
        role="status"
        data-room-phase={phase}
        className="text-center font-semibold text-amber-100"
      >
        {statusLine}
      </p>

      <div ref={skyRef} className="relative">
        {record && (phase === "live" || phase === "after") ? (
          <DrawView
            record={record}
            ticket={ticket}
            onClose={onClose}
            clock={clock}
            startedAt={showStart}
            timing={LIVE_ROULETTE_TIMING}
            label={title}
            embedded
          />
        ) : (
          <SkyBoard
            state={{
              mode: "draw",
              picked: ticket ? ticket.numbers : [],
              focus: null,
              lit: [],
              bonus: null,
            }}
            label={`${title} 추첨을 기다리는 하늘`}
          />
        )}
        {phase === "count" && (
          <div
            aria-live="assertive"
            data-room-countdown
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <span
              key={Math.ceil(toShow / 1000)}
              className="sd-room-count font-black text-8xl text-amber-50 tabular-nums"
            >
              {Math.ceil(toShow / 1000)}
            </span>
          </div>
        )}
        {phase === "live" && !record && (
          <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/75">
            하늘에서 추첨 결과를 받고 있습니다.
          </p>
        )}
        {/* 풍등: 얼굴에서 떠올라 하늘로 흐려진다 */}
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {lanterns
            .filter((l) => !l.hidden)
            .map((l) => (
              <LanternBubble
                key={l.key}
                lantern={l}
                onHold={pass && l.from !== me ? openMenu : undefined}
              />
            ))}
          {sparks
            .filter((s) => s.kind === "meteor")
            .map((s) => (
              <span
                key={s.key}
                className="sd-room-meteor absolute h-px w-24 bg-gradient-to-r from-transparent to-white"
                style={{ left: `${s.x * 70}%`, top: "12%" }}
              />
            ))}
        </div>
      </div>

      {popular.length > 0 && phase !== "after" && (
        <p className="text-center text-white/55 text-xs">
          가장 많이 고른 별 · {popular.join(" · ")}
        </p>
      )}

      {/* 언덕: 모여 앉은 얼굴들 */}
      <div
        className="sd-room-hill relative -mx-4 px-4 pt-6 pb-2"
        data-room-hill
      >
        <div className="flex flex-wrap items-end justify-center gap-1.5">
          {faces.map((pid) => {
            const p = people.get(pid) as RoomPerson;
            const a = astronautOf(fromBase64Url(p.pub));
            const twinkle = sparks.some(
              (s) => s.kind === "twinkle" && s.to === pid,
            );
            return (
              <button
                key={pid}
                type="button"
                data-face={pid}
                data-face-entered={p.entered || undefined}
                aria-label={`${a.name}${p.entered ? ", 응모함" : ""}${pid === me ? ", 나" : ""}`}
                onClick={() => cheer("twinkle", pid)}
                className={cn(
                  "sd-room-face relative size-12 overflow-hidden rounded-full border",
                  p.entered ? "border-amber-200/70" : "border-white/15",
                  pid === me && "ring-2 ring-sky-200/70",
                  glowing(pid) && "sd-room-face-glow",
                  twinkle && "sd-room-face-twinkle",
                )}
              >
                <Avatar
                  face={a.face}
                  egg={a.egg}
                  label=""
                  className="size-full scale-125"
                />
                {p.director && (
                  <span className="absolute inset-x-0 bottom-0 bg-rose-500/80 text-[8px] text-white">
                    국장
                  </span>
                )}
              </button>
            );
          })}
          {more > 0 && (
            <span className="grid size-12 place-items-center rounded-full border border-white/15 text-sm text-white/70">
              +{more}
            </span>
          )}
          {faces.length === 0 && (
            <span className="py-3 text-sm text-white/50">
              아직 아무도 오지 않았어요.
            </span>
          )}
        </div>
      </div>

      {/* 아래: 내가 하는 일(말하기·별똥별) */}
      {closed ? (
        <div className="flex flex-col items-center gap-2 py-2">
          <button
            type="button"
            onClick={onEnter}
            className="sd-cta w-full max-w-xs rounded-2xl py-3 font-bold text-slate-950"
          >
            다음 회차 응모하기
          </button>
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            ref={inputRef}
            aria-label="말하기"
            value={draft}
            maxLength={ROOM_TEXT_MAX * 2}
            onChange={(e) => {
              const v = e.target.value;
              if (roomCharCount(v) <= ROOM_TEXT_MAX) setDraft(v);
            }}
            onPointerDown={(e) => {
              if (!pass) {
                e.preventDefault();
                void ensurePass();
              }
            }}
            readOnly={!pass}
            placeholder="말하기"
            className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm placeholder:text-white/35"
            data-room-input
          />
          <button
            type="button"
            aria-label="별똥별 보내기"
            onClick={() => cheer("meteor", null)}
            className="grid size-11 place-items-center rounded-full border border-white/15 text-lg"
          >
            ☄
          </button>
          {pass && (
            <button
              type="submit"
              className="rounded-2xl bg-amber-100 px-4 py-3 font-bold text-slate-900 text-sm"
            >
              보내기
            </button>
          )}
        </form>
      )}
      {!closed && !hasKey && (
        <button
          type="button"
          onClick={() => void setup.recover()}
          disabled={setup.working !== null}
          className="self-center text-sm text-white/70 underline underline-offset-2"
        >
          이미 등록했어요 · 신분증 제시
        </button>
      )}
      {registeringNow && (
        <p className="text-center text-white/60 text-xs">
          {/* 장부는 응모를 받는 동안만 등록을 받는다(마감부터 추첨 몇 초 뒤 다음 회차가 열릴 때까지는 기다린다) */}
          {services.ledger.status().phase === "open"
            ? "장부에 우주인 등록을 올리고 있습니다."
            : "다음 회차 응모가 열리면 장부에 우주인 등록을 올립니다."}
        </p>
      )}
      {(sendNote ?? setup.error?.text) && (
        <p className="text-center text-rose-200 text-xs">
          {sendNote ?? setup.error?.text}
        </p>
      )}
      {problem && (
        <p className="text-center text-white/60 text-sm">{problem}</p>
      )}

      {phase === "after" && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <span className="font-semibold">
            지금 {roundTitle(schedule, round + 1)} 응모를 받고 있어요.
          </span>
          <button
            type="button"
            onClick={onEnter}
            className="sd-cta w-full max-w-xs rounded-2xl py-3 font-bold text-slate-950"
          >
            별 6개 고르기
          </button>
        </div>
      )}

      {menu && (
        <div className="fixed inset-0 z-40 flex items-end justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            tabIndex={-1}
            onClick={() => setMenu(null)}
            className="absolute inset-0 bg-slate-950/50"
          />
          <div
            role="dialog"
            aria-label="말 다루기"
            className="relative flex w-full max-w-sm flex-col gap-2 rounded-3xl bg-slate-900 p-4 text-center"
            data-room-menu
          >
            <p className="break-keep px-2 py-1 text-sm text-white/80">
              “{menu.lantern.text}”
            </p>
            {director ? (
              <>
                <button
                  type="button"
                  disabled={!menu.nonce}
                  onClick={() => void moderate("hide")}
                  className="rounded-2xl bg-white/10 py-3 font-semibold disabled:opacity-40"
                >
                  가리기
                </button>
                <button
                  type="button"
                  disabled={!menu.nonce}
                  onClick={() => void moderate("kick")}
                  className="rounded-2xl bg-rose-500/80 py-3 font-semibold disabled:opacity-40"
                >
                  내보내기
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void report(menu.lantern)}
                className="rounded-2xl bg-white/10 py-3 font-semibold"
              >
                신고
              </button>
            )}
            <button
              type="button"
              onClick={() => setMenu(null)}
              className="py-2 text-sm text-white/60"
            >
              닫기
            </button>
          </div>
        </div>
      )}
      <IdPresentView services={services} id={id} />
      {/* 등록하지 않은 사람: 입력 칸을 누르면 첫 화면 입구와 같은 「우주인 등록 신청서」, 다른 기기에서 등록했으면 신분증 제시 */}
      <WelcomeFlyer services={services} setup={setup} />
      {setup.issued && (
        <IssuedView
          services={services}
          setup={setup}
          overlay
          goLabel="방으로 돌아가기"
        />
      )}
    </section>
  );
}

/** 이 회차를 방으로 보여 줄지: 서버가 있고, 방이 아직 열려 있는 동안(추첨 7분 뒤까지) */
export function roomOpen(
  services: Services,
  round: number,
  nowSec: number,
): boolean {
  if (!serverApi()) return false;
  const times = roundTimes(services.ledger.schedule, round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  return nowSec >= times.opensAt && nowSec < drawAt + 7 * 60;
}

/** 실시간 추첨이 끝났는지(시작 + 연출 길이). 끝났으면 방에서도 다시 보기 규칙을 따른다 */
export function liveOver(
  services: Services,
  round: number,
  record: RoundRecord | null | undefined,
  nowMs: number,
): boolean {
  const times = roundTimes(services.ledger.schedule, round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  const length = record
    ? planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING).totalMs
    : 46_000;
  return nowMs >= drawAt * 1000 + LIVE_LEAD_MS + length;
}

/**
 * 지금 실시간 추첨 중인 회차(안내 15초 전부터 연출이 끝날 때까지). 서버가 없으면(연습 장부) 늘 null.
 * 첫 화면은 이 동안 그 추첨을 주인공으로, 다음 회차 응모는 연출이 끝난 뒤에 띄운다
 */
export function liveDrawRound(
  services: Services,
  status: { round: number; now: number },
): number | null {
  if (!serverApi()) return null;
  const nowMs = status.now * 1000;
  for (const r of [status.round - 1, status.round]) {
    if (r < 1) continue;
    const times = roundTimes(services.ledger.schedule, r);
    const drawAt = drandTime(drandRoundForClose(times.closesAt));
    const start = drawAt * 1000 + LIVE_LEAD_MS;
    if (
      nowMs >= start - 15_000 &&
      !liveOver(services, r, services.ledger.record(r), nowMs)
    )
      return r;
  }
  return null;
}

/** 로컬 데모 바로가기로 들어왔으면 추첨이 끝난 뒤 다음 회차 방으로 따라간다(탭 안에서만 기억) */
export const ROOM_FOLLOW_KEY = "stardraw-room-follow";

/**
 * 다음 추첨(또는 지금 실시간 추첨 중인) 회차: 열린 회차 가운데 실시간 연출이 아직 끝나지 않은 가장 이른 회차.
 * 장부(일정표)를 아직 받지 못했으면 null
 */
export function nextRoomRound(
  services: Services,
  nowMs: number,
): number | null {
  try {
    const schedule = services.ledger.schedule;
    const nowSec = nowMs / 1000;
    for (let r = 1; r < 1_000_000; r++) {
      const times = roundTimes(schedule, r);
      if (times.opensAt > nowSec) return null;
      if (!liveOver(services, r, services.ledger.record(r), nowMs)) return r;
    }
  } catch {
    return null;
  }
  return null;
}
