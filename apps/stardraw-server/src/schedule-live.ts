import {
  checkScheduleChange,
  isAlignedEpoch,
  liveStart,
  phaseOf,
  roundAt,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  withChange,
} from "@mighty/stardraw-core";

import { LIVE_ROUND_SECONDS, scheduleEntry } from "./config";
import type { Store } from "./store";

/**
 * 정식 단계 예약(docs/36 11-6): 장부를 새로 만들지 않고, 일정 바꾸기 한 줄(phase live)을 다음에 닫히는 회차 기록에 싣는다.
 * 규칙의 24시간 예고를 그대로 따르므로 정식 첫 회차는 그 기록 마감 + 24시간 뒤에 열리는 회차부터다.
 * 여기서는 규칙을 미리 확인해 저장소에 예약만 하고, 실제로 싣는 것은 돌고 있는 서버(엔진)가 한다.
 */

export interface ScheduleLiveResult {
  change: ScheduleEntry;
  /** 일정 바꾸기를 실을 회차(다음에 닫히는 기록) */
  decidedIn: number;
}

/** 저장소의 처음 일정표에 기록들의 일정 바꾸기를 모두 반영한 지금 일정표 */
export function currentSchedule(store: Store): Schedule {
  const genesis = store.storedGenesis();
  if (!genesis) throw new Error("장부가 없다. 서버를 먼저 띄운다");
  let schedule = genesis;
  for (let r = 1; r <= store.recordCount(); r++)
    for (const change of store.record(r)?.scheduleChanges ?? [])
      schedule = withChange(schedule, change);
  return schedule;
}

export function scheduleLive(
  store: Store,
  from: number,
  roundSeconds = LIVE_ROUND_SECONDS,
): ScheduleLiveResult {
  const schedule = currentSchedule(store);
  if (phaseOf(schedule, 1) !== "trial")
    throw new Error("시험 단계로 시작한 장부가 아니다");
  if (liveStart(schedule) !== null)
    throw new Error(`이미 ${liveStart(schedule)}회차부터 정식 단계다`);
  if (store.pendingChange())
    throw new Error(
      "이미 예약한 일정 바꾸기가 있다(서버가 다음 기록에 싣는다)",
    );
  if (!isAlignedEpoch(from, roundSeconds))
    throw new Error(
      "정식 첫 회차는 추첨이 정각에 오게 시작해야 한다(1시간 회차면 x:55)",
    );
  const fromRound = roundAt(schedule, from);
  if (fromRound === null || roundTimes(schedule, fromRound).opensAt !== from)
    throw new Error("시작 시각이 시험 회차가 열리는 시각과 맞지 않는다");
  const change = scheduleEntry(fromRound, "live", roundSeconds);
  const decidedIn = store.recordCount() + 1;
  const problem = checkScheduleChange(schedule, change, decidedIn);
  if (problem) throw new Error(`${problem}(${decidedIn}회차 기록에 실린다)`);
  store.setPendingChange(change);
  return { change, decidedIn };
}

/** `schedule-live --from <ISO> [--round-seconds <초>]` */
export function parseScheduleLiveArgs(args: readonly string[]): {
  from: number;
  roundSeconds?: number;
} {
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fromText = value("--from");
  const ms = fromText ? Date.parse(fromText) : Number.NaN;
  if (!Number.isFinite(ms) || ms % 1000 !== 0)
    throw new Error(
      "--from <ISO 시각>이 필요하다(예: 2026-11-02T08:55:00+09:00)",
    );
  const seconds = value("--round-seconds");
  return {
    from: ms / 1000,
    ...(seconds ? { roundSeconds: Number(seconds) } : {}),
  };
}
