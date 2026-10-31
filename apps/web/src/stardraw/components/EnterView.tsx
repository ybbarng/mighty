"use client";

import {
  type KeyRegistration,
  makeRegistration,
  signTicket,
  solvePow,
  type Ticket,
  ticketContent,
  unsignedTicket,
} from "@mighty/stardraw-core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { FX } from "../fx-timing";
import { greetNow } from "../greeting";
import type { LedgerStatus } from "../local-ledger";
import {
  inAppBrowser,
  type PasskeyProblem,
  passkeyApi,
  passkeyFailText,
  passkeyProblem,
  platformUnlock,
} from "../passkey-env";
import { usableHolding } from "../qual-store";
import { ensureRegistered, registering, signProof } from "../registrar";
import { roundShort } from "../round-label";
import { DEMO_NS, type Services } from "../services";
import type { KeyInfo } from "../wallet";
import {
  type Failure,
  failureOf,
  IssuedView,
  useAstronautSetup,
  WelcomeFlyer,
} from "./AstronautSetup";
import { PickedRow, SubmitView } from "./EnterSubmit";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { KeyIcon } from "./PasskeyHelp";
import { StardrawTitle, StarInfo } from "./parts";
import { SkyBoard } from "./SkyBoard";
import { StageOverlay, useReducedMotion } from "./StageOverlay";

/**
 * 응모 단계. pick: 별 고르기. busy: 움직임 줄이기에서 응모하는 중(고르는 화면 그대로).
 * 그 밖은 제출 연출(EnterSubmit.tsx): 용지 마킹 → 용지 제출 → 신분증 제시(패스키 서명) → 출력구
 */
type Stage = "pick" | "busy" | "paper" | "id" | "print";

/** 패스키를 쓸 수 있는 환경(첫 그리기 뒤에 잰다) */
export interface Env {
  inApp: string | null;
  api: boolean;
  /** 이 기기 잠금(얼굴·지문·PIN)으로 패스키를 쓸 수 있는지 */
  platform: boolean;
  ua: string;
}

/** 패스키를 쓸 수 있는 환경(첫 그리기 뒤에 잰다) */
export function usePasskeyEnv(): Env | null {
  const [env, setEnv] = useState<Env | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    let alive = true;
    void platformUnlock().then((platform) => {
      if (alive)
        setEnv({ inApp: inAppBrowser(ua), api: passkeyApi(), platform, ua });
    });
    return () => {
      alive = false;
    };
  }, []);
  return env;
}

/** 응모: 네모 하늘이나 아래 번호 칸에서 별 6개를 고르고 낸다 */
export function EnterView({
  services,
  status,
  onDone,
  onBack,
  initialPicked = [],
  extra,
}: {
  services: Services;
  status: LedgerStatus;
  onDone: (ticket: Ticket, receivedAt: number) => void;
  onBack: () => void;
  /** 데모: 미리 골라 둘 번호 */
  initialPicked?: readonly number[];
  /** 데모: 번호 칸 위에 더 둘 도구 */
  extra?: ReactNode;
}) {
  const [picked, setPicked] = useState<number[]>([...initialPicked]);
  const [focus, setFocus] = useState<number | null>(null);
  /** 6개를 다 고른 뒤 또 누른 횟수: 응모권 칸이 짧게 흔들린다(글 없이) */
  const [nudges, setNudges] = useState(0);
  const [stage, setStage] = useState<Stage>("pick");
  /** 제출 연출에서 용지가 제출(위로 올라가 사라짐)됐을 때 이어 갈 곳 */
  const paperRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const env = usePasskeyEnv();
  /** 이 기기·브라우저의 패스키. 없으면 별을 고르기 전에 먼저 만든다(등록과 서명을 나눈다, 2026-10-30 사용자) */
  const [key, setKey] = useState<KeyInfo | null>(() =>
    services.wallet.loadKey(),
  );
  const setup = useAstronautSetup(services, setKey);
  const reduce = useReducedMotion();
  /** 이 회차에 붙일 수 있는 상품 자격(docs/36 11-13)과 붙일지 */
  const [qual, setQual] = useState<ReturnType<typeof usableHolding>>(null);
  /** 응모할 때 신분증 제출(신분증 제시 틀) */
  const id = useIdPresent(services);
  const [useQual, setUseQual] = useState(true);
  const full = picked.length === 6;
  const open = status.phase === "open";
  // 데모는 실제 패스키 대신 화면 안 흉내 시트를 쓴다: 패스키를 못 쓰는 환경 안내로 막지 않는다
  const demo = services.ns === DEMO_NS;

  useEffect(() => {
    let alive = true;
    services.ledger
      .qualInfo()
      .then((info) => {
        if (alive)
          setQual(
            usableHolding(
              services.ns,
              services.ledger.id(),
              info,
              status.round,
            ),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [services, status.round]);

  const fail = (err: unknown) => {
    setStage("pick");
    setError(failureOf(err, "응모되지 않았어요"));
  };

  const toggle = (n: number) => {
    setFocus(n);
    setError(null);
    if (!picked.includes(n) && picked.length >= 6) {
      setNudges((k) => k + 1);
      return;
    }
    setPicked((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 6) return prev;
      play("beep");
      return [...prev, n];
    });
  };

  const fill = (keep: number[]) => {
    const out = [...keep];
    const bag = crypto.getRandomValues(new Uint8Array(64));
    let i = 0;
    while (out.length < 6) {
      const b = bag[i++ % bag.length] as number;
      if (i >= bag.length) crypto.getRandomValues(bag);
      if (b >= 225) continue;
      const n = (b % 45) + 1;
      if (!out.includes(n)) out.push(n);
    }
    setPicked(out);
    setFocus(out.at(-1) ?? null);
    play("beep");
  };

  /**
   * 응모: 누르는 순간 서명 앞에 할 수 있는 일(등록 확인, 응모권 작업 증명)을 시작하고, 그동안 용지 작성·제출 연출을 겹친다.
   * 응모권은 작업 증명을 먼저 풀고 그 결과까지 패스키로 서명하므로(makeTicket 순서) 용지를 낸 뒤
   * "패스키로 신분증을 제출해 주세요."에서 서명한다. 차례(Apple Pay의 카드 제시처럼): 문구 → 패스키 → 등록증이 아래에서
   * 올라옴 → 확인 표시 → 내려감 → 출력구가 영수증을 기다림. 서명 뒤 제출은 등록증 연출과 겹쳐 진행한다.
   * 실제 처리가 먼저 끝나도 연출은 끝까지 보인다. 취소·실패면 고른 별을 그대로 둔 채 고르는 화면으로.
   * 움직임 줄이기면 연출 없이 바로 서명한다
   */
  const submit = async (key: KeyInfo) => {
    setError(null);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { ledger } = services;
    const entry = ledger.status().times.entry;
    const challenge = ledger.head();
    const round = status.round;
    const numbers = [...picked];
    const holding = qual && useQual ? qual.holding : null;
    const prep = (async () => {
      const signer = await services.wallet.signerFor(key);
      let registration: KeyRegistration | undefined;
      // 우주인 등록 직후 올리던 등록이 아직 돌고 있으면 그것을 기다린다
      if (!(await ledger.isRegistered(key.pub)))
        await registering(services, key)?.catch(() => null);
      if (!(await ledger.isRegistered(key.pub))) {
        // 등록 증명이 없는 예전 열쇠나 올리지 못한 등록은 응모권과 함께 낸다
        const made = await makeRegistration(
          { publicKey: key.pub },
          key.credentialId,
          challenge,
          entry.registerPowTarget,
          { params: ledger.powParams },
        );
        if (!made) throw new Error("응모권을 만들지 못했습니다");
        registration = made;
      }
      const unsigned = unsignedTicket(signer, round, numbers, holding);
      const nonce = await solvePow(
        challenge,
        ticketContent(unsigned),
        entry.powTarget,
        { params: ledger.powParams },
      );
      if (nonce === null) throw new Error("응모권을 만들지 못했습니다");
      return { signer, unsigned, nonce, registration };
    })();
    // 연출 중에 실패해도 처리되지 않은 거절로 남지 않게(아래에서 기다릴 때 다시 받는다)
    prep.catch(() => {});
    const wait = (ms: number) =>
      new Promise<void>((r) => services.clock.after(ms, r));
    try {
      if (reduce) {
        setStage("busy");
        const p = await prep;
        const ticket = await signTicket(p.signer, p.unsigned, p.nonce);
        const { receivedAt } = await ledger.submit(ticket, p.registration);
        play("starBall");
        onDone(ticket, receivedAt);
        return;
      }
      window.scrollTo({ top: 0 });
      await new Promise<void>((r) => {
        paperRef.current = r;
        setStage("paper");
      });
      // 신분증 제출(신분증 제시 틀): 문구 → 「신분증 제출」 누름 → 패스키 → 등록증 올라옴 → 확인 → 내려감.
      // 응모하기를 누른 지 시간이 흘러 브라우저가 패스키 창을 막을 수 있어 여기서 한 번 누름을 받는다
      setStage("id");
      const p = await prep;
      let sent: ReturnType<typeof ledger.submit> | null = null;
      const ticket = await id.run(
        () => signTicket(p.signer, p.unsigned, p.nonce),
        {
          verb: "제출",
          pub: key.pub,
          readFirst: true,
          tap: true,
          hold: FX.idHoldSubmit,
          keep: true,
          done: `${residentPhrase(astronautOf(key.pub))} 님, ${greetNow(services.clock.now(), "submit")}`,
          onConfirmed: (t) => {
            sent = ledger.submit(t, p.registration);
            sent.catch(() => {});
          },
        },
      );
      if (!ticket || !sent) {
        setStage("pick");
        return;
      }
      setStage("print");
      const { receivedAt } = await (sent as ReturnType<typeof ledger.submit>);
      play("starBall");
      onDone(ticket, receivedAt);
    } catch (err) {
      fail(err);
    }
  };

  /** 응모 단추: 고른 별로 응모권을 만들고 등록증(패스키)으로 서명한다(확인 한 번) */
  const start = async () => {
    if (key) await submit(key);
  };

  // 발급한 등록증: 움직임 줄이기면 이 화면 대신, 아니면 화면 전체 오버레이로 위에 뜬다
  if (setup.issued && reduce)
    return (
      <IssuedView
        services={services}
        setup={setup}
        header={
          <EnterHeader
            onBack={onBack}
            round={roundShort(services.ledger.schedule, status.round)}
          />
        }
      />
    );

  if (!key)
    return (
      <section className="flex flex-col gap-4" aria-label="응모">
        {setup.issued && (
          <IssuedView services={services} setup={setup} overlay />
        )}
        <EnterHeader
          onBack={onBack}
          round={roundShort(services.ledger.schedule, status.round)}
        />
        <KeySetup
          demo={demo}
          env={env}
          working={setup.working}
          note={setup.note}
          error={setup.error}
          onCreate={() => void setup.create()}
          onRecover={() => void setup.recover()}
        />
      </section>
    );

  const title = `${roundShort(services.ledger.schedule, status.round)} 응모권`;
  const picking = stage === "pick";
  const submitting = stage !== "pick" && stage !== "busy";
  return (
    <section className="flex flex-col gap-4" aria-label="응모">
      {/* 제출 연출은 화면 전체 오버레이 한 층에서(뒤의 고르는 화면은 흐려지고 조작되지 않는다) */}
      {submitting && (
        <StageOverlay label="응모">
          {stage === "paper" && (
            <SubmitView
              title={title}
              picked={picked}
              onSubmitted={() => paperRef.current?.()}
            />
          )}
          {stage === "print" && (
            <div
              className="sd-text-in sd-printer relative mx-auto w-full max-w-sm"
              data-printer-wait
            >
              <div
                aria-hidden="true"
                className="sd-printer-slot sd-printer-idle"
              />
            </div>
          )}
        </StageOverlay>
      )}
      <IdPresentView services={services} id={id} verb="제출" backdrop={false} />
      <EnterHeader onBack={onBack} />

      <SkyBoard
        state={{ mode: "pick", picked, focus, lit: [], bonus: null }}
        onPick={picking ? toggle : undefined}
        label={`응모판: 서울 하늘의 밝은 별 45개. 고른 별 ${picked.join(", ") || "없음"}`}
      />

      <StarInfo n={focus} />

      {extra}

      <PickedRow
        key={nudges}
        shake={nudges > 0}
        title={title}
        picked={picked}
        onRemove={picking ? toggle : undefined}
      />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={!picking}
          onClick={() => fill([])}
          className="rounded-xl border border-white/15 bg-white/5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          자동
        </button>
        <button
          type="button"
          disabled={!picking || full}
          onClick={() => fill(picked)}
          className="rounded-xl border border-white/15 bg-white/5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          남은 칸 자동
        </button>
        <button
          type="button"
          disabled={!picking || picked.length === 0}
          onClick={() => {
            setPicked([]);
            setFocus(null);
          }}
          className="rounded-xl border border-white/15 bg-white/5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          지우기
        </button>
      </div>

      {qual && (
        <label
          className="flex items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-200/5 px-3 py-2 text-sm"
          data-qual-toggle={useQual ? "on" : "off"}
        >
          <input
            type="checkbox"
            checked={useQual}
            disabled={!picking}
            onChange={(e) => setUseQual(e.target.checked)}
            className="size-4 accent-amber-300"
          />
          <span className="font-semibold text-amber-50">
            {qual.period.affiliationName} 소속으로 응모
          </span>
        </label>
      )}

      {error && <ErrorBox error={error} />}

      <WelcomeFlyer services={services} setup={setup} />

      <button
        type="button"
        disabled={!full || !open || !picking}
        onClick={() => void start()}
        className="sd-cta rounded-2xl py-4 font-black text-slate-950 text-xl disabled:opacity-40"
      >
        {stage === "busy"
          ? "응모하고 있습니다"
          : !open
            ? status.phase === "waiting"
              ? "앞 회차 추첨이 끝나면 응모할 수 있습니다"
              : "이번 회차 응모가 마감되었습니다"
            : "응모하기"}
      </button>
    </section>
  );
}

/**
 * 응모 화면 머리: 돌아가기. 등록 단계는 첫 화면과 같은 제목·소개 문구와 회차 이름도 둔다.
 * 별을 고르는 화면은 응모권 이름이 머리 역할이라 제목을 두지 않는다(같은 정보가 겹쳐 보였다, 2026-10-31 사용자)
 */
function EnterHeader({
  onBack,
  round,
}: {
  onBack: () => void;
  round?: string;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 처음으로
        </button>
        {round && (
          <span className="text-sm text-white/60 tabular-nums">
            {round} 응모
          </span>
        )}
      </div>
      {round && <StardrawTitle />}
    </header>
  );
}

/** 오류 상자. 패스키 확인을 취소했으면 설명 페이지의 패스키 칸으로 잇는다 */
function ErrorBox({ error }: { error: Failure }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-rose-100 text-sm"
    >
      <p className="break-keep">{error.text}</p>
      {error.kind === "cancelled" && (
        <a
          href="/stardraw/about#passkey"
          className="self-start text-rose-100 underline underline-offset-2"
        >
          자세히
        </a>
      )}
    </div>
  );
}

/**
 * 우주인 등록(docs/36 11-9): 응모하려면 등록증(= 이 기기의 패스키)이 필요하다. 별을 고르기 전에 먼저 만든다(확인 한 번).
 * 다른 기기에서 만든 패스키가 따라왔으면 「이미 우주인 등록증이 있어요」로 찾는다.
 * 게임 흐름에서는 우주인 말로 부르고, "패스키"는 등록 단계 한 줄에만 둔다(기술 설명은 /stardraw/about#passkey).
 * 패스키를 못 쓰는 환경(앱 안 브라우저·미지원)은 한두 줄로 안내한다. 데모는 흉내라 막지 않는다
 */
export function KeySetup({
  demo,
  env,
  working,
  note,
  error,
  onCreate,
  onRecover,
  gate = false,
}: {
  /** 첫 화면 입구: 우주국 인사가 위에 있어 그림·제목·설명을 두지 않고, 찾기는 「신분증 제시」 */
  gate?: boolean;
  demo: boolean;
  env: Env | null;
  working: null | "create" | "recover";
  note: string | null;
  error: Failure | null;
  onCreate: () => void;
  onRecover: () => void;
}) {
  const blocked = !demo && env && (env.inApp || !env.api);
  return (
    <div
      className="sd-glass flex flex-col items-center gap-3 rounded-3xl px-5 py-7 text-center"
      data-key-setup
    >
      {!gate && (
        <>
          <KeyIcon className="size-9 text-amber-100" />
          <h2 className="font-bold text-xl">우주인 등록</h2>
          <p className="break-keep text-sm text-white/80">
            하늘의 별 따기는 등록한 우주인만 응모할 수 있습니다.
          </p>
        </>
      )}
      {blocked ? (
        env?.inApp ? (
          <InAppNotice app={env.inApp} />
        ) : (
          <p role="note" className="break-keep text-sm text-white/80">
            이 브라우저는 패스키를 지원하지 않아요. 최신 Safari·Chrome으로 열어
            주세요.
          </p>
        )
      ) : (
        <>
          <button
            type="button"
            disabled={working !== null || (!demo && !env)}
            onClick={onCreate}
            className="sd-cta w-full max-w-xs rounded-2xl py-3 font-bold text-slate-950 disabled:opacity-40"
          >
            {working === "create" ? "등록하고 있습니다" : "우주인 등록"}
          </button>
          {!demo && env && !env.platform && (
            <p className="break-keep text-white/55 text-xs">
              화면 잠금(지문·얼굴·PIN)을 켜면 이 기기에서 바로 만들 수 있어요.
            </p>
          )}
          {!demo && (
            <button
              type="button"
              disabled={working !== null}
              onClick={onRecover}
              className="text-sm text-white/75 underline underline-offset-2 disabled:opacity-40"
            >
              {working === "recover"
                ? "찾고 있습니다"
                : gate
                  ? "신분증 제시"
                  : "이미 우주인 등록증이 있어요"}
            </button>
          )}
        </>
      )}
      {note && <p className="break-keep text-amber-100/85 text-xs">{note}</p>}
      {error && <ErrorBox error={error} />}
      <p className="break-keep text-white/55 text-xs" data-passkey-line>
        우주인 등록증은 이 기기의 패스키로 만들어집니다 ·{" "}
        <a
          href="/stardraw/about#passkey"
          className="text-sky-200 underline underline-offset-2"
        >
          자세히
        </a>
      </p>
    </div>
  );
}

/** 앱 안 브라우저(카톡 등)는 패스키가 막힌다: Safari·Chrome으로 열도록 주소를 복사해 준다 */
function InAppNotice({ app }: { app: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm"
    >
      <p className="break-keep text-amber-50">
        {app} 안에서는 패스키를 쓸 수 없어요. Safari나 Chrome으로 열어 주세요.
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(location.href);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 hover:bg-amber-200/10"
      >
        {copied ? "주소를 복사했어요" : "주소 복사"}
      </button>
    </div>
  );
}
