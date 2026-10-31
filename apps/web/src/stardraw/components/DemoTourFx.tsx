"use client";

import { fromBase64Url } from "@mighty/stardraw-core";
import { type ReactNode, useEffect, useState } from "react";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import {
  TOUR_ANDROMEDA_PUB,
  TOUR_EARTH_PUB,
  type TourState,
} from "../demo-tour";
import { FX } from "../fx-timing";
import { greetNow } from "../greeting";
import { roundShort } from "../round-label";
import { AstronautPanel } from "./AstronautPanel";
import { IssuedView, type useAstronautSetup } from "./AstronautSetup";
import { DemoUnlockPrompt } from "./DemoUnlockSheet";
import { SubmitView } from "./EnterSubmit";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { Receipt } from "./Receipt";
import { ReceiptPrint } from "./ReceiptPrint";
import { StageOverlay, useReducedMotion } from "./StageOverlay";
import { Gate, RoundCard } from "./StardrawApp";

/** 둘러보기의 연출 항목(DemoTour TOUR_ITEMS에 이어 붙인다) */
export const FX_ITEMS = [
  { id: "fx-gate", label: "입구" },
  { id: "fx-issue", label: "연출: 등록증 발급" },
  { id: "fx-issue-earth", label: "연출: 지구 출신 발급" },
  { id: "fx-issue-andromeda", label: "연출: 안드로메다 출신 발급" },
  { id: "fx-welcome", label: "연출: 신분증 제시(입장)" },
  { id: "fx-submit", label: "연출: 응모" },
  { id: "fx-print", label: "연출: 영수증 출력" },
  { id: "fx-card-open", label: "회차 카드: 응모 중" },
  { id: "fx-card-entered", label: "회차 카드: 응모함" },
  { id: "fx-card-drawing", label: "회차 카드: 마감(응모함)" },
  { id: "fx-card-closed-none", label: "회차 카드: 마감(응모 안 함)" },
] as const;
export type FxId = (typeof FX_ITEMS)[number]["id"];

const noop = () => {};

/** 아무 일도 하지 않는 등록 상태(둘러보기의 입구·발급은 장부·지갑을 건드리지 않는다) */
function stubSetup(
  over: Partial<ReturnType<typeof useAstronautSetup>> = {},
): ReturnType<typeof useAstronautSetup> {
  return {
    working: null,
    note: null,
    error: null,
    issued: null,
    pocketing: false,
    id: { present: null, run: async () => null, confirm: noop },
    create: async () => {},
    recover: async () => {},
    pocket: noop,
    ...over,
  };
}

/**
 * 둘러보기의 연출 한 장면. 연출이 끝나면 「다시 보기」로 처음부터 다시 본다(저장값을 지우지 않는다).
 * 움직임 줄이기 설정이면 실제 화면처럼 연출 없이 결과 모습만 보인다
 */
export function FxScreen({ id, s }: { id: FxId; s: TourState }): ReactNode {
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  const reduce = useReducedMotion();
  const { services, drawn, pending } = s;
  const status = services.ledger.status();
  const pub = drawn.ticket.pub;
  const replay = (
    <button
      type="button"
      onClick={() => {
        setDone(false);
        setRun((n) => n + 1);
      }}
      className="self-center rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
    >
      다시 보기
    </button>
  );
  const finish = () => setDone(true);
  const key = `${id}-${run}`;

  switch (id) {
    case "fx-gate":
      return (
        <Gate
          services={services}
          status={status}
          env={null}
          setup={stubSetup()}
          onSkip={null}
        />
      );
    case "fx-card-open":
    case "fx-card-entered":
    case "fx-card-drawing":
    case "fx-card-closed-none":
      return (
        <RoundCard
          services={services}
          status={
            id === "fx-card-drawing" || id === "fx-card-closed-none"
              ? { ...status, phase: "closing" }
              : status
          }
          mine={
            id === "fx-card-entered" || id === "fx-card-drawing"
              ? [pending]
              : []
          }
          envelope={undefined}
          onEnter={noop}
          onReceipt={noop}
          onDraw={noop}
        />
      );
    case "fx-issue":
    case "fx-issue-earth":
    case "fx-issue-andromeda": {
      const issuePub =
        id === "fx-issue-earth"
          ? fromBase64Url(TOUR_EARTH_PUB)
          : id === "fx-issue-andromeda"
            ? fromBase64Url(TOUR_ANDROMEDA_PUB)
            : pub;
      if (reduce)
        return (
          <IssuedView
            services={services}
            setup={stubSetup({
              issued: {
                kind: "demo",
                pub: issuePub,
                credentialId: new Uint8Array(),
              },
            })}
          />
        );
      return (
        <>
          {!done && <IssueFx key={key} s={s} pub={issuePub} onDone={finish} />}
          {replay}
        </>
      );
    }
    case "fx-welcome":
      if (reduce) return <AstronautPanel services={services} pub={pub} />;
      return (
        <>
          {!done && <WelcomeFx key={key} s={s} onDone={finish} />}
          {replay}
        </>
      );
    case "fx-submit":
    case "fx-print": {
      const receipt = (
        <Receipt
          ticket={pending.ticket}
          receivedAt={pending.receivedAt}
          schedule={services.ledger.schedule}
        />
      );
      if (reduce) return receipt;
      return (
        <>
          {!done &&
            (id !== "fx-print" ? (
              <SubmitFx key={key} s={s} onDone={finish} />
            ) : (
              <ReceiptPrint
                key={key}
                ticket={pending.ticket}
                receivedAt={pending.receivedAt}
                schedule={services.ledger.schedule}
                onDone={finish}
              />
            ))}
          {replay}
          {receipt}
        </>
      );
    }
  }
}

/** 발급: 등록증이 위에서 내려오고, 「별을 고르러 가 볼까요?」를 누르면 아래로 내려가 사라진다 */
function IssueFx({
  s,
  pub,
  onDone,
}: {
  s: TourState;
  pub: Uint8Array;
  onDone: () => void;
}) {
  const [pocketing, setPocketing] = useState(false);
  return (
    <IssuedView
      services={s.services}
      overlay
      setup={stubSetup({
        issued: {
          kind: "demo",
          pub,
          credentialId: new Uint8Array(),
        },
        pocketing,
        pocket: () => {
          setPocketing(true);
          window.setTimeout(onDone, FX.issuePocket + FX.pause);
        },
      })}
    />
  );
}

const sleep = (ms: number) =>
  new Promise<void>((r) => window.setTimeout(r, ms));

/** 흉내 패스키 창을 띄우고 답을 기다린다 */
function useAsk() {
  const [ask, setAsk] = useState<((ok: boolean) => void) | null>(null);
  const open = () =>
    new Promise<boolean>((r) =>
      setAsk(() => (ok: boolean) => {
        setAsk(null);
        r(ok);
      }),
    );
  return { ask, open };
}

/** 입장: 실제 입장과 같은 신분증 제시 틀(입구 단추가 곧 제시라 바로 흉내 지문) */
function WelcomeFx({ s, onDone }: { s: TourState; onDone: () => void }) {
  const id = useIdPresent(s.services);
  const { ask, open } = useAsk();
  const pub = s.drawn.ticket.pub;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 그릴 때 한 번
  useEffect(() => {
    void id
      .run(async () => ((await open()) ? true : null), {
        verb: "제시",
        pub,
        done: `${residentPhrase(astronautOf(pub))} 님, ${greetNow(Date.now(), "enter")}`,
      })
      .then(onDone);
  }, []);
  return (
    <>
      <IdPresentView services={s.services} id={id} verb="제시" />
      {ask && (
        <DemoUnlockPrompt ask={{ id: 0, purpose: "check", answer: ask }} />
      )}
    </>
  );
}

/**
 * 응모: 실제 응모와 같은 차례(용지 작성 → 제출 → 신분증 제출 틀 → 영수증 출력). 흉내 지문을 쓰고 장부에는 아무것도
 * 내지 않는다
 */
function SubmitFx({ s, onDone }: { s: TourState; onDone: () => void }) {
  const { services, pending } = s;
  const [stage, setStage] = useState<"paper" | "id" | "print" | "printing">(
    "paper",
  );
  const id = useIdPresent(services);
  const { ask, open } = useAsk();
  const submitted = async () => {
    setStage("id");
    const ok = await id.run(async () => ((await open()) ? true : null), {
      verb: "제출",
      pub: pending.ticket.pub,
      readFirst: true,
      tap: true,
      hold: FX.idHoldSubmit,
      keep: true,
      done: `${residentPhrase(astronautOf(pending.ticket.pub))} 님, ${greetNow(Date.now(), "submit")}`,
    });
    if (!ok) return onDone();
    setStage("print");
    await sleep(FX.pause * 2);
    setStage("printing");
  };
  return (
    <>
      {stage !== "printing" && (
        <StageOverlay label="응모">
          {stage === "paper" && (
            <SubmitView
              title={`${roundShort(services.ledger.schedule, pending.ticket.round)} 응모권`}
              picked={pending.ticket.numbers}
              onSubmitted={() => void submitted()}
            />
          )}
          {stage === "print" && (
            <div className="sd-text-in sd-printer relative mx-auto w-full max-w-sm">
              <div
                aria-hidden="true"
                className="sd-printer-slot sd-printer-idle"
              />
            </div>
          )}
        </StageOverlay>
      )}
      <IdPresentView services={services} id={id} verb="제출" backdrop={false} />
      {ask && (
        <DemoUnlockPrompt ask={{ id: 0, purpose: "sign", answer: ask }} />
      )}
      {stage === "printing" && (
        <ReceiptPrint
          ticket={pending.ticket}
          receivedAt={pending.receivedAt}
          schedule={services.ledger.schedule}
          continued
          onDone={onDone}
        />
      )}
    </>
  );
}
