import type {
  Action,
  CompletedTrick,
  GameEvent,
  PlayerView,
  PresetDeal,
  RuleSet,
} from "@mighty/engine";
import { isJoker, mightyOf } from "@mighty/engine";
import type { BusyReason } from "@mighty/fair-play";
import { create } from "zustand";
import type { EndVoteState } from "@/components/FairOverlays";
import {
  ArchiveRecorder,
  type ArchiveTarget,
  soloArchive,
} from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { botFor, browserPace } from "./bots";
import { cuesFor } from "./cues";
import type { MatchHost, Snapshot, SubmitResult } from "./host";
import { LocalMatch, type SavedMatch } from "./local-match";
import { mightyKit } from "./mighty-kit";
import { saveGame } from "./persistence";
import { useSettings } from "./settings";
import { play as playCue } from "./sound";
import { dealPlan, prefersReducedMotion, SHUFFLE_MS } from "./timing";

/** 화면에 붙일 수 있는 대국. 처음 쌓인 진행을 넘겨 줄 수 있어야 한다 */
export type AttachableHost = MatchHost & { drain(): Snapshot[] };

/** 이벤트마다 화면이 머무는 시간(ms). docs/05-layout.md 3.9절 */
const EVENT_DELAY: Partial<Record<GameEvent["type"], number>> = {
  roundStarted: 300,
  dealt: 700,
  picked: 600,
  // 컴퓨터가 생각하는 시간처럼 보이게 원작(공약 1.5초, 카드 0.5초)에 가깝게 둔다.
  bid: 1300,
  passed: 1000,
  // 딜미스한 사람의 패를 보여 주므로 오래 머문다.
  dealMiss: 2800,
  allPassed: 1500,
  // 당선·공약 변경·프렌드 선언은 가운데 발표 상자를 읽을 시간을 준다(원작 2.5~4초).
  elected: 2600,
  killAttempt: 1400,
  redealtForDead: 900,
  kittyTaken: 900,
  exchanged: 1200,
  friendDeclared: 3000,
  played: 650,
  friendRevealed: 2200,
  roundScored: 300,
};
/** 트릭이 끝나고 이긴 카드를 보여 주는 시간과, 이긴 사람에게 모으는 시간 */
const TRICK_HOLD = 1100;
const TRICK_COLLECT = 380;

export interface NewGameOptions {
  rules: RuleSet;
  seed?: number;
  presetDeal?: PresetDeal;
}

interface GameStore {
  host: AttachableHost | null;
  /** 온라인 대전에서 자리별 이름. 혼자 할 때는 `null`(나·컴퓨터 이름) */
  seatNames: string[] | null;
  /** 지금 화면에 보이는 정보. 엔진보다 늦게 따라간다 */
  view: PlayerView | null;
  events: GameEvent[];
  /** 스냅숏을 하나 재생할 때마다 1씩 늘어난다. 효과 연출을 다시 시작하는 데 쓴다 */
  seq: number;
  queue: Snapshot[];
  /** 끝난 트릭을 잠시 바닥에 남겨 둔다 */
  shownTrick: CompletedTrick | null;
  collecting: boolean;
  /** 판 시작 섞기·나눠 주기 연출 중. `key`가 바뀌면 연출을 새로 시작한다 */
  dealing: {
    key: number;
    handSize: number;
    startDelay: number;
    /** 섞는 연출 시간(멘탈 포커로 이미 섞는 연출을 보였으면 남은 만큼) */
    shuffleMs: number;
  } | null;
  /** 판 시작 때의 돈. 결과 화면에서 변화를 보여 준다 */
  roundStartMoney: number[];
  busy: boolean;
  notice: string | null;
  /** 온라인 대전이 끝난 뒤 공정성 확인 결과(참가자) */
  audit: { ok: true } | { ok: false; reason: string } | null;
  /** 온라인 대전에서 방장이 나가 더 진행할 수 없음 */
  hostLeft: boolean;
  /** 온라인 대전에서 방장과 잠깐 끊겨 다시 연결을 기다리는 중(참가자) */
  reconnecting: boolean;
  /** 온라인 대전에서 연결이 끊긴 사람 자리. 그동안 컴퓨터가 대신 둔다 */
  offlineSeats: number[];
  /** 판 끝 검증에서 누군가 문제를 찾았다. 이 게임은 무효로 본다 */
  invalid: string | null;
  /**
   * 부정을 찾아 판을 멈췄다(멘탈 포커). `own`이면 내 기기가 찾은 것, 아니면 판을 진행하는 방장이 알린 것.
   * `seat`가 null이면 누군지 가릴 수 없다
   */
  incident: { seat: number | null; reason: string; own: boolean } | null;
  /**
   * 멘탈 포커 판: 내 카드를 아직 다 열지 못했다. 판 시작 섞기(`deal`), 6·7마 다시 섞기(`redeal`),
   * 그 밖에 바닥 카드·증명을 기다리는 중(`wait`)
   */
  shuffling: BusyReason | null;
  /** 섞는 연출(`ShuffleLoop`)을 시작한 시각. 나눠 줄 때 남은 섞기 연출 시간을 정한다 */
  shuffleStartedAt: number | null;
  setShuffling(reason: BusyReason | null): void;
  /** 멘탈 포커 판인가(연결이 끊긴 사람을 컴퓨터가 대신하지 않고 기다린다) */
  fair: boolean;
  /** 방장: 연결이 끊긴 사람을 더 기다리지 않고 게임을 끝낸다(멘탈 포커) */
  endGame: (() => void) | null;
  /** 멘탈 포커: 끊긴 사람을 오래 기다려 연 끝내기 투표와 내 표 내기 */
  endVote: EndVoteState | null;
  voteEnd: ((end: boolean) => void) | null;
  /** 다른 사람과 하는 온라인 대전인가. 카드 툴팁 같은 도움 기능을 끈다(원작 `bUseHintInNetwork`) */
  network: boolean;
  newGame(options: NewGameOptions): void;
  /** 저장해 둔 대국을 이어서 한다 */
  resume(saved: SavedMatch): void;
  /** 온라인 대국(방장의 LocalMatch나 참가자의 RemoteMatch)을 붙인다 */
  attachOnline(
    host: AttachableHost,
    seatNames: string[],
    options?: {
      network?: boolean;
      stats?: StatsTarget;
      archive?: Omit<ArchiveTarget, "source"> & {
        source?: ArchiveTarget["source"];
      };
    },
  ): void;
  setSeatNames(seatNames: string[]): void;
  /** 다시 보기: 남긴 기록을 화면에 붙인다(저장·기록하지 않는다) */
  attachReplay(host: AttachableHost, seatNames: string[] | null): void;
  submit(action: Action): SubmitResult;
  clearNotice(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

export const useGame = create<GameStore>((set, get) => {
  /** `scaled`가 거짓이면 속도 설정과 빨리 감기를 무시한다(실제 시간으로 도는 연출용) */
  const wait = (ms: number, then: () => void, scaled = true) => {
    // 밀린 진행이 많으면 빨리 감는다.
    const backlog = scaled && get().queue.length > 10 ? 1.4 : 1;
    const speed = scaled ? useSettings.getState().speed : 1;
    timer = setTimeout(
      () => {
        timer = null;
        then();
      },
      ms / (speed * backlog),
    );
  };

  const advance = (): void => {
    if (timer !== null) return;
    const [next, ...rest] = get().queue;
    if (next === undefined) {
      set({ busy: false });
      return;
    }
    const started = next.events.some((e) => e.type === "roundStarted");
    set({
      queue: rest,
      view: next.view,
      events: next.events,
      seq: get().seq + 1,
      busy: true,
      ...(started ? { roundStartMoney: [...next.view.money] } : {}),
    });

    const dealt = next.events.find((e) => e.type === "dealt");
    const { sound, speed } = useSettings.getState();
    if (sound) {
      // 나눠 주기 연출은 실제 시간으로 돌고, 나머지는 속도 설정을 따른다.
      const scale = dealt ? 1 : speed;
      for (const { cue, delay = 0, times = 1 } of cuesFor(
        next.view,
        next.events,
      ))
        playCue(cue, { delay: delay / scale, times });
    }

    if (dealt && next.view.rules.playerCount !== 2 && !prefersReducedMotion()) {
      const others = next.events.filter(
        (e) => e.type !== "dealt" && e.type !== "roundStarted",
      );
      const startDelay = Math.max(
        0,
        ...others.map((e) => EVENT_DELAY[e.type] ?? 150),
      );
      // 멘탈 포커로 실제로 섞는 동안 섞는 연출을 보였으면 최소 시간에서 남은 만큼만 더 섞는다.
      const since = get().shuffleStartedAt;
      const shuffleMs =
        since === null
          ? SHUFFLE_MS
          : Math.max(0, SHUFFLE_MS - (Date.now() - since));
      set({
        dealing: {
          key: (get().dealing?.key ?? 0) + 1,
          handSize: dealt.handSize,
          startDelay,
          shuffleMs,
        },
        shuffleStartedAt: null,
      });
      // 연출 컴포넌트가 실제 시간으로 돌기 때문에 빨리 감지 않는다.
      wait(
        startDelay +
          dealPlan(dealt.handSize, next.view.players.length).duration -
          SHUFFLE_MS +
          shuffleMs,
        () => {
          set({ dealing: null });
          advance();
        },
        false,
      );
      return;
    }

    if (next.events.some((e) => e.type === "trickWon")) {
      const shownTrick = next.view.tricks.at(-1) ?? null;
      set({ shownTrick, collecting: false });
      wait(TRICK_HOLD, () => {
        set({ collecting: true });
        wait(TRICK_COLLECT, () => {
          set({ shownTrick: null, collecting: false });
          advance();
        });
      });
      return;
    }
    const mighty = mightyOf(next.view.rules, next.view.goal?.kiruda ?? "NT");
    // 마이티·조커·조커콜은 효과 글자를 읽을 시간을 더 준다.
    const bigPlay = next.events.some(
      (e) =>
        e.type === "played" &&
        (e.jokerCall || e.card === mighty || isJoker(e.card)),
    );
    const delay = Math.max(
      bigPlay ? 950 : 0,
      ...next.events.map((e) => EVENT_DELAY[e.type] ?? 150),
    );
    wait(delay, advance);
  };

  const enqueue = (snapshots: Snapshot[]) => {
    set({ queue: [...get().queue, ...snapshots] });
    advance();
  };

  /**
   * 대국을 화면에 붙인다. 혼자 하는 대국(LocalMatch)은 진행될 때마다 저장하고,
   * 온라인 대국은 저장하지 않는다(방장 기기가 기록을 들고 있다).
   */
  const attach = (
    host: AttachableHost,
    options: {
      save: boolean;
      seatNames: string[] | null;
      network?: boolean;
      /** 내 기록에 남길 대국(배우기는 남기지 않는다) */
      stats?: StatsTarget;
      /** 복기용으로 남길 대국(시작 조건과 행동 기록은 이 기기의 대국에서 꺼낸다) */
      archive?: Omit<ArchiveTarget, "source"> & {
        source?: ArchiveTarget["source"];
      };
    },
  ) => {
    clearTimer();
    unsubscribe?.();
    const current = host.current();
    const pending = host.drain();
    set({
      host,
      view: pending.length > 0 ? null : current,
      events: [],
      queue: [],
      shownTrick: null,
      collecting: false,
      dealing: null,
      busy: false,
      roundStartMoney: [...current.money],
      seatNames: options.seatNames,
      network: options.network ?? false,
      invalid: null,
      incident: null,
      shuffling: null,
      shuffleStartedAt: null,
    });
    const persist = () => {
      if (options.save && host instanceof LocalMatch) saveGame(host.save());
    };
    persist();
    const recorder = options.stats
      ? new StatsRecorder(mightyKit.stats, options.stats)
      : null;
    // 복기용 기록: 온라인 방장은 방이 기록을 내주고, 혼자 하기는 이 기기의 대국에서 꺼낸다.
    const archiveSource =
      options.archive?.source ??
      (host instanceof LocalMatch
        ? () => {
            const saved = host.save();
            return {
              rules: saved.rules,
              seed: saved.seed,
              ...(saved.presetDeal ? { presetDeal: saved.presetDeal } : {}),
              log: saved.log,
            };
          }
        : null);
    const archiver =
      options.archive && archiveSource
        ? new ArchiveRecorder(mightyKit.stats, {
            ...options.archive,
            source: archiveSource,
          })
        : null;
    for (const snapshot of pending) {
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
    }
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
      enqueue([snapshot]);
    });
    enqueue(pending);
  };

  return {
    host: null,
    seatNames: null,
    view: null,
    events: [],
    seq: 0,
    queue: [],
    shownTrick: null,
    collecting: false,
    dealing: null,
    roundStartMoney: [],
    busy: false,
    notice: null,
    audit: null,
    hostLeft: false,
    reconnecting: false,
    offlineSeats: [],
    network: false,
    invalid: null,
    incident: null,
    shuffling: null,
    shuffleStartedAt: null,
    setShuffling(reason) {
      const { shuffling, shuffleStartedAt } = get();
      // 판 시작 섞기를 시작할 때 섞는 연출 시작 시각을 적는다(다 나눠 줄 때까지 둔다).
      const starting = reason === "deal" && shuffling !== "deal";
      set({
        shuffling: reason,
        shuffleStartedAt: starting ? Date.now() : shuffleStartedAt,
      });
    },
    fair: false,
    endGame: null,
    endVote: null,
    voteEnd: null,

    newGame(options) {
      const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
      const host = new LocalMatch({
        rules: options.rules,
        seed,
        bot: botFor(useSettings.getState().botLevel),
        pace: browserPace,
        ...(options.presetDeal ? { presetDeal: options.presetDeal } : {}),
      });
      attach(host, {
        save: true,
        seatNames: null,
        stats: { game: "mighty", mode: "solo", key: `solo:${seed}` },
        archive: soloArchive("mighty", `solo:${seed}`),
      });
      set({ fair: false, endGame: null, endVote: null, voteEnd: null });
    },

    resume(saved) {
      attach(
        LocalMatch.restore(saved, {
          bot: botFor(useSettings.getState().botLevel),
          pace: browserPace,
        }),
        {
          save: true,
          seatNames: null,
          stats: { game: "mighty", mode: "solo", key: `solo:${saved.seed}` },
          archive: soloArchive("mighty", `solo:${saved.seed}`),
        },
      );
    },

    attachOnline(host, seatNames, options) {
      attach(host, {
        save: false,
        seatNames,
        network: options?.network ?? false,
        ...(options?.stats ? { stats: options.stats } : {}),
        ...(options?.archive ? { archive: options.archive } : {}),
      });
    },

    attachReplay(host, seatNames) {
      attach(host, { save: false, seatNames });
      set({ fair: false, endGame: null, endVote: null, voteEnd: null });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
    },

    submit(action) {
      const { host } = get();
      if (host === null) return { ok: false, error: "게임이 없다" };
      const result = host.submit(action);
      if (!result.ok) set({ notice: result.error });
      return result;
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});

/**
 * 사람이 지금 고를 수 있는가. 재생할 장면이 남아 있거나 트릭·나눠 주기를 보여 주는 중이면 기다린다.
 * 마지막 장면의 남은 연출 시간(바닥 카드 들어오기 등)은 기다리지 않는다. 그 사이 누른 것이 사라지지 않게 하려고.
 */
export function canAct(
  state: Pick<GameStore, "queue" | "view" | "shownTrick" | "dealing">,
): boolean {
  return (
    state.queue.length === 0 &&
    state.shownTrick === null &&
    state.dealing === null &&
    state.view?.decision != null
  );
}
