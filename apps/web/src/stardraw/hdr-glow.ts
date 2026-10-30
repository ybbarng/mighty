import { useEffect, useState } from "react";

/**
 * HDR 별빛(docs/36 화면 절): HDR 화면에서만 몇몇 별 위에 "흰색보다 밝은" 빛 그림을 겹친다.
 * 그림은 `public/stardraw/star-glow-hdr.avif`(BT.2020 PQ, `scripts/build-stardraw-hdr-glow.mjs`).
 * 캔버스(2D)는 SDR이라 HDR 그림을 그려도 잘리므로 캔버스 위에 img로 겹친다.
 * 쓰는 곳은 셋뿐이다(눈부시지 않게).
 *  - flash: 추첨 룰렛이 멈춰 뽑힌 별이 켜지는 순간 한 번 번쩍이고 사라진다
 *  - hit:   추첨 결과에서 내가 고른 별이 맞은 별(보너스 포함)을 은은하게 맥동
 *  - calm:  응모 하늘에서 가장 밝은 별 셋(1 시리우스·2 아크투루스·3 직녀성)을 아주 은은하게
 * 강도는 CSS 변수 `--sd-hdr-strength`(globals.css)로 한 번에 바꾼다.
 */

export const HDR_GLOW_SRC = "/stardraw/star-glow-hdr.avif";

export type HdrGlowKind = "flash" | "hit" | "calm";

export interface HdrGlow {
  n: number;
  kind: HdrGlowKind;
}

/** 응모 하늘에서 은은하게 빛나는 가장 밝은 별(번호는 밝은 순서) */
export const CALM_STARS: readonly number[] = [1, 2, 3];

export const CALM_GLOWS: readonly HdrGlow[] = CALM_STARS.map((n) => ({
  n,
  kind: "calm",
}));

/**
 * 추첨 화면의 HDR 별빛.
 * @param fixed 지금까지 켜진 별(당첨 6개 다음 보너스)
 * @param mine 내가 고른 별
 * @param done 결과까지 나왔는지
 * @param animated 룰렛 연출을 실제로 보는지(바로 보기·움직임 줄이기면 번쩍임 없이 결과만)
 */
export function drawGlows({
  fixed,
  mine,
  done,
  animated,
}: {
  fixed: readonly number[];
  mine: readonly number[];
  done: boolean;
  animated: boolean;
}): HdrGlow[] {
  const glows: HdrGlow[] = [];
  if (animated) for (const n of fixed) glows.push({ n, kind: "flash" });
  if (done) {
    const own = new Set(mine);
    for (const n of fixed) if (own.has(n)) glows.push({ n, kind: "hit" });
  }
  return glows;
}

const HDR_QUERY = "(dynamic-range: high)";

/** 이 화면이 HDR인지(창을 다른 화면으로 옮기면 바뀐다). 서버 그리기와 첫 그림은 false */
export function useHdrScreen(): boolean {
  const [hdr, setHdr] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(HDR_QUERY);
    setHdr(mq.matches);
    const onChange = () => setHdr(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return hdr;
}
