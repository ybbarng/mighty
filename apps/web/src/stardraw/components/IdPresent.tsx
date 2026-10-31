"use client";

import { useRef, useState } from "react";
import { FX } from "../fx-timing";
import { passkeyProblem } from "../passkey-env";
import type { Services } from "../services";
import { type CardSpot, IdFlyer } from "./IdFlyer";

/** 신분증 제시 화면의 한 순간(useIdPresent가 정한다) */
export interface IdPresent {
  pub: Uint8Array | null;
  card: CardSpot;
  checked: boolean;
  text: string;
  closing: boolean;
  /** 사람이 등록증을 내밀기(밀어 올리거나 누르기)를 기다리는 중 */
  asking: boolean;
}

/** 신분증 제시 틀의 위쪽 문구. 목적 자리만 다르다 */
export const idText = (verb: "제시" | "제출") =>
  `패스키로 신분증을 ${verb}해 주세요.`;

/**
 * 신분증 제시 틀: 패스키 서명을 요구하는 곳이 같은 차례·같은 문구 틀·같은 시간으로 쓴다(2026-10-31 사용자:
 * 같은 행동은 어디서나 같게). "패스키로 신분증을 ○○해 주세요." → 패스키 → 등록증이 아래에서 올라옴 → 확인 표시 →
 * 결과 문구 → 내려감 → 걷힘(Apple Pay의 카드 제시 리듬). 목적(제시·제출)과 결과 문구만 다르다.
 * 취소·실패면 등록증은 올라오지 않고 걷힌다. 움직임 줄이기면 연출 없이 패스키만. 반환 값은 `action`의 결과(없으면 null)
 */
export function useIdPresent(services: Services) {
  const [present, setPresent] = useState<IdPresent | null>(null);
  /** 「신분증 제시/제출」(true)·「취소」(false)를 기다리는 곳 */
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const wait = (ms: number) =>
    new Promise<void>((r) => services.clock.after(ms, r));
  const run = async <T,>(
    action: () => Promise<T | null>,
    opts: {
      /** 문구의 목적 자리 */
      verb: "제시" | "제출";
      /** 등록증에 그릴 공개 열쇠(미리 알면), 아니면 결과에서 */
      pub?: Uint8Array | ((r: T) => Uint8Array);
      /** 확인 뒤 바뀌는 결과 문구(없으면 그대로) */
      done?: string | ((r: T) => string);
      /** 확인 뒤 머무는 시간 */
      hold?: number;
      /**
       * 문구를 읽을 틈을 두고 패스키를 연다. 단추를 누른 그 순간 패스키를 열어야 하는 곳(브라우저가 누름 없이 연 창을
       * 막을 수 있다)은 false: 문구와 패스키 창이 함께 뜬다
       */
      readFirst?: boolean;
      /** 패스키가 끝난 순간(연출이 이어지는 동안 뒤 화면을 바꾸거나 제출을 시작할 때) */
      onConfirmed?: (r: T) => void;
      /** 끝에서 걷지 않고 남긴다(바로 다음 연출이 이어질 때) */
      keep?: boolean;
      /**
       * 패스키 전에 사람이 등록증을 내밀게 한다(등록증이 아래에서 살짝 올라와 기다리고, 밀어 올리거나 누르면 그 동작 직후
       * 패스키). 앞서 누른 단추에서 시간이 흘러(연출 등) 패스키 창이 막힐 수 있는 곳에 쓴다. 단추를 누르자마자 이 틀을
       * 부르는 곳은 그 누름이 곧 제시라 두지 않는다(같은 동작을 두 번 시키지 않는다). 취소하면 등록증은 그 자리에서 다시 기다린다
       */
      tap?: boolean;
    },
  ): Promise<T | null> => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = await action();
      if (r !== null) opts.onConfirmed?.(r);
      return r;
    }
    let p: IdPresent = {
      pub: opts.pub instanceof Uint8Array ? opts.pub : null,
      card: "hidden",
      checked: false,
      text: idText(opts.verb),
      closing: false,
      asking: false,
    };
    const go = (patch: Partial<IdPresent>) => {
      p = { ...p, ...patch };
      setPresent(p);
    };
    go({});
    if (opts.readFirst) await wait(FX.read);
    let r: T | null = null;
    if (opts.tap) {
      // 등록증이 아래에서 살짝 올라와 내밀기를 기다린다. 내밀면(누름 처리 안에서 이어져) 바로 패스키
      go({ card: "peek" });
      for (;;) {
        go({ asking: true });
        const ok = await new Promise<boolean>((res) => {
          answer.current = res;
        });
        answer.current = null;
        go({ asking: false });
        if (!ok) {
          setPresent(null);
          return null;
        }
        try {
          r = await action();
        } catch (err) {
          if (passkeyProblem(err) === "cancelled") continue;
          setPresent(null);
          throw err;
        }
        if (r !== null) break;
      }
    } else {
      try {
        r = await action();
      } catch (err) {
        setPresent(null);
        throw err;
      }
      if (r === null) {
        setPresent(null);
        return null;
      }
    }
    const got = r;
    opts.onConfirmed?.(got);
    if (typeof opts.pub === "function") go({ pub: opts.pub(got) });
    await wait(FX.pause);
    go({ card: "up" });
    await wait(FX.idIn + FX.pause);
    go({ checked: true });
    navigator.vibrate?.(20);
    await wait(FX.idCheck + FX.pause);
    if (opts.done)
      go({
        text: typeof opts.done === "function" ? opts.done(got) : opts.done,
      });
    await wait(opts.hold ?? FX.idHold);
    go({ card: "hidden" });
    await wait(FX.idOut + FX.pause);
    if (opts.keep) {
      setPresent(null);
      return got;
    }
    go({ closing: true });
    await wait(FX.stageOut);
    setPresent(null);
    return got;
  };
  return {
    present,
    run,
    confirm: (ok: boolean) => answer.current?.(ok),
  };
}

/** useIdPresent의 화면(떠 있을 때만) */
export function IdPresentView({
  services,
  id,
  verb,
  backdrop = true,
}: {
  services: Services;
  id: ReturnType<typeof useIdPresent>;
  verb: "제시" | "제출";
  backdrop?: boolean;
}) {
  const p = id.present;
  if (!p) return null;
  return (
    <IdFlyer
      services={services}
      pub={p.pub}
      card={p.card}
      checked={p.checked}
      text={p.text}
      closing={p.closing}
      backdrop={backdrop}
      press={
        p.asking
          ? {
              label: `신분증 ${verb}`,
              onPress: () => id.confirm(true),
              onCancel: () => id.confirm(false),
            }
          : undefined
      }
    />
  );
}
