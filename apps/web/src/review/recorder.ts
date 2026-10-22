import type { Snapshot } from "@/game/host";
import type { KitLoggedAction, KitStats } from "@/game/kit";
import type { StatsMode } from "@/stats/records";

import { saveArchive } from "./archive";

/** 복기용 기록의 내용: 시작 조건과 행동 기록(멘탈 포커 판이면 판별 실제 패) */
export interface ArchiveSource {
  rules: unknown;
  seed: number;
  presetDeal?: unknown;
  deals?: Record<number, unknown>;
  log: KitLoggedAction<unknown>[];
}

/** 복기용으로 남길 대국. `source`는 그 순간의 시작 조건과 행동 기록을 돌려준다 */
export interface ArchiveTarget {
  game: string;
  mode: StatsMode;
  key: string;
  seat: number;
  seatNames: string[] | null;
  source: () => ArchiveSource | null;
}

/**
 * 판·게임이 끝날 때마다 복기용 기록을 고쳐 쓴다(같은 대국은 한 줄). 그만둔 게임도 끝낸 판까지 복기할 수 있다
 */
export class ArchiveRecorder<View, Event> {
  private rounds = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly spec: KitStats<View, Event>,
    private readonly target: ArchiveTarget,
  ) {}

  observe(snapshot: Snapshot<View, Event>): void {
    const ended = this.spec.roundEnded(snapshot.events);
    const over = this.spec.gameEnded(snapshot.events);
    if (!ended && !over) return;
    if (ended) this.rounds = this.spec.roundNumber(snapshot.view);
    const source = this.target.source();
    if (!source) return;
    void saveArchive({
      id: this.target.key,
      game: this.target.game,
      mode: this.target.mode,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      ...source,
      seat: this.target.seat,
      seatNames: this.target.seatNames,
      rounds: this.rounds,
      over,
    });
  }
}

/** 혼자 하는 대국: 내 자리는 0번, 자리 이름은 화면이 컴퓨터 이름을 붙인다 */
export function soloArchive(
  game: string,
  key: string,
): Omit<ArchiveTarget, "source"> {
  return { game, mode: "solo", key, seat: 0, seatNames: null };
}

/** 참가자: 판 검증을 통과할 때마다 받은 기록을 바로 남긴다 */
export function saveGuestArchive(
  target: Omit<ArchiveTarget, "source">,
  source: ArchiveSource,
  rounds: number,
  over: boolean,
): void {
  void saveArchive({
    id: target.key,
    game: target.game,
    mode: target.mode,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    ...source,
    seat: target.seat,
    seatNames: target.seatNames,
    rounds,
    over,
  });
}
