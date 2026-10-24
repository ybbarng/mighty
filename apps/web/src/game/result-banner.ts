import type { GameEvent, PlayerView } from "@mighty/engine";

/** 판이 끝났을 때 화면 가운데에 크게 띄우는 승패 문구 */
export interface ResultBanner {
  won: boolean;
  /** 아래 줄(런·백런, 돈 변화) */
  detail: string | null;
}

/**
 * 마이티: 판 점수가 난 장면이면 내 편이 이겼는지와 덧붙일 말을 고른다.
 * 돈은 결과 상자(`RoundResultPanel`)처럼 10배로 보인다
 */
export function mightyResultBanner(
  view: PlayerView,
  events: readonly GameEvent[],
  startMoney: readonly number[],
): ResultBanner | null {
  const scored = events.find((e) => e.type === "roundScored");
  if (!scored) return null;
  const ruling = view.seat === view.declarer || view.seat === view.friend;
  const won = ruling === scored.result.rulingWon;
  const { multipliers } = scored.result;
  const before = startMoney[view.seat] ?? view.money[view.seat] ?? 0;
  const delta = ((view.money[view.seat] ?? 0) - before) * 10;
  const parts = [
    multipliers.includes("run") ? "런!" : null,
    multipliers.includes("reverseRun") ? "백런!" : null,
    delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}` : null,
  ].filter((p) => p !== null);
  return { won, detail: parts.length > 0 ? parts.join(" · ") : null };
}
