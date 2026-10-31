"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { FX } from "../fx-timing";
import { greetNow } from "../greeting";
import {
  type PasskeyProblem,
  passkeyFailText,
  passkeyProblem,
} from "../passkey-env";
import { ensureRegistered, signProof } from "../registrar";
import type { Services } from "../services";
import type { KeyInfo } from "../wallet";
import { AstronautPanel } from "./AstronautPanel";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { StageOverlay } from "./StageOverlay";

export type Failure = { kind: PasskeyProblem; text: string };

/** 패스키 오류를 화면 문구로 */
export function failureOf(err: unknown, what: string): Failure {
  const kind = passkeyProblem(err);
  return {
    kind,
    text:
      kind === "cancelled"
        ? passkeyFailText(err, what)
        : kind === "unsupported"
          ? "이 기기에서는 등록증을 만들 수 없어요. '다른 기기 사용'을 골라 휴대폰으로 만들어 주세요."
          : err instanceof Error
            ? err.message
            : String(err),
  };
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 우주인 등록(패스키 만들기)과 신분증 제시(이미 있는 패스키 찾기). 첫 화면 입구와 응모 화면이 같이 쓴다.
 * 등록하면 발급한 등록증을 보여 주고(위에서 내려온다, `IssuedView`), 계속하면 등록증만 아래로 내려가 사라진 뒤 `onReady`.
 * 제시는 신분증 제시 틀(useIdPresent, `WelcomeFlyer`)로: "패스키로 신분증을 제시해 주세요." → 패스키 →
 * 등록증 올라옴 → 확인 표시 → 인사로 바뀌어 머묾 → 내려감. 입구의 「신분증 제시」 누름이 곧 제시라 단추를 다시 두지
 * 않고 바로 패스키를 연다. 취소하면 등록증은 올라오지 않고 원래 화면으로
 */
export function useAstronautSetup(
  services: Services,
  onReady: (key: KeyInfo, how: "created" | "found") => void,
) {
  const [working, setWorking] = useState<null | "create" | "recover">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  /** 방금 발급한 등록증 */
  const [issued, setIssued] = useState<KeyInfo | null>(null);
  /** 발급한 등록증을 주머니에 넣는 중(아래로 내려가며 사라진다) */
  const [pocketing, setPocketing] = useState(false);
  /** 신분증 제시(입장) 연출 */
  const id = useIdPresent(services);

  /** 우주인 등록 = 패스키 만들기(확인 한 번). 서명은 별을 고른 뒤 응모할 때 한다 */
  const create = async () => {
    setWorking("create");
    setNote(null);
    setError(null);
    try {
      const made = await services.wallet.createPasskey();
      // 바로 장부에 등록한다: 그 패스키로 등록 증명에 서명하고(확인 한 번 더), 작업 증명·올리기는 뒤에서
      try {
        await signProof(services, made);
        void ensureRegistered(services, made).catch(() => {});
      } catch {
        // 서명을 취소하면 첫 응모 때 응모권과 함께 등록한다
      }
      setIssued(made);
    } catch (err) {
      setError(failureOf(err, "등록하지 않았어요"));
    } finally {
      setWorking(null);
    }
  };

  /** 신분증 제시: 다른 기기에서 만든(따라온) 패스키를 찾아 장부의 등록을 확인한다 */
  const recover = async () => {
    setWorking("recover");
    setNote(null);
    setError(null);
    try {
      const found = await id.run(
        async () => {
          const k = await services.wallet.recoverPasskey((cid) =>
            services.ledger.passkeyPub(cid),
          );
          if (!k) setNote("장부에 없는 등록증이에요.");
          return k;
        },
        {
          verb: "제시",
          pub: (k) => k.pub,
          done: (k) =>
            `${residentPhrase(astronautOf(k.pub))} 님, ${greetNow(services.clock.now(), "enter")}`,
          onConfirmed: (k) => {
            setWorking(null);
            void ensureRegistered(services, k).catch(() => {});
            onReady(k, "found");
          },
        },
      );
      if (!found) setWorking(null);
    } catch (err) {
      setWorking(null);
      setError(failureOf(err, "등록증을 찾지 못했어요"));
    }
  };

  /** 발급한 등록증을 넣고 계속(아래로 내려가며 사라진 뒤) */
  const pocket = () => {
    const key = issued;
    if (!key) return;
    const done = () => {
      setIssued(null);
      setPocketing(false);
      onReady(key, "created");
    };
    if (reduced()) return done();
    setPocketing(true);
    services.clock.after(FX.issuePocket + FX.pause, done);
  };

  return {
    working,
    note,
    error,
    issued,
    pocketing,
    id,
    create,
    recover,
    pocket,
  };
}

/**
 * 발급한 등록증. `overlay`면 화면 전체 오버레이에서 등록증만 위(우주국)에서 내려와 가운데 자리 잡고, 등록 문구와
 * 단추는 아래 고정 자리(엄지 닿는 곳)에 둔다. 계속하면 등록증만 아래(내 주머니)로 내려가 사라지고 문구·단추는
 * 그 자리에서 흐려진다(같이 미끄러지지 않는다, 2026-10-31 사용자). 아니면(움직임 줄이기) 그 화면 자리에 그린다
 */
export function IssuedView({
  services,
  setup,
  header,
  overlay = false,
}: {
  services: Services;
  setup: ReturnType<typeof useAstronautSetup>;
  header?: ReactNode;
  overlay?: boolean;
}) {
  const key = setup.issued;
  if (!key) return null;
  const greeting = (
    <p
      role="status"
      data-issued="new"
      className="flex flex-col items-center gap-1 break-keep text-center text-amber-100"
    >
      <span className="text-sm text-amber-100/75">
        {residentPhrase(astronautOf(key.pub))} 님,
      </span>
      <span className="font-bold text-xl">
        우주인으로 등록되었습니다. 환영합니다!
      </span>
    </p>
  );
  const go = (
    <button
      type="button"
      disabled={setup.pocketing}
      onClick={setup.pocket}
      className="sd-cta rounded-2xl py-3.5 font-bold text-lg text-slate-950"
    >
      별을 고르러 가 볼까요?
    </button>
  );
  if (overlay)
    return (
      <StageOverlay label="우주인 등록증 발급" scroll>
        <div
          className={cn(
            "sd-after transition-opacity duration-500",
            setup.pocketing && "opacity-0",
          )}
          style={
            {
              "--fx-delay": `${FX.issueDrop + FX.pause}ms`,
            } as React.CSSProperties
          }
        >
          {greeting}
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col justify-center",
            setup.pocketing ? "sd-id-pocket" : "sd-id-drop",
          )}
          style={
            {
              "--fx-ms": `${setup.pocketing ? FX.issuePocket : FX.issueDrop}ms`,
            } as React.CSSProperties
          }
        >
          <AstronautPanel services={services} pub={key.pub} bare />
        </div>
        <div
          className={cn(
            "sd-after sticky bottom-0 flex flex-col gap-4 bg-gradient-to-t from-[#070b16] via-[#070b16]/90 to-transparent pt-6 pb-1 transition-opacity duration-500",
            setup.pocketing && "opacity-0",
          )}
          style={
            {
              "--fx-delay": `${FX.issueDrop + FX.pause}ms`,
            } as React.CSSProperties
          }
        >
          {go}
        </div>
      </StageOverlay>
    );
  return (
    <section className="flex flex-col gap-4" aria-label="우주인 등록증 발급">
      {header}
      <AstronautPanel services={services} pub={key.pub} greeting={greeting}>
        {go}
      </AstronautPanel>
    </section>
  );
}

/** 신분증을 제시해 들어올 때의 연출(움직임 줄이기면 그리지 않는다) */
export function WelcomeFlyer({
  services,
  setup,
}: {
  services: Services;
  setup: ReturnType<typeof useAstronautSetup>;
}) {
  return <IdPresentView services={services} id={setup.id} verb="제시" />;
}
