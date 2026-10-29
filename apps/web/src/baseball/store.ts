import { baseballBotFor } from "@mighty/baseball-ai";
import {
  type Action,
  type BaseballRules,
  type BaseballState,
  type BaseballView,
  commitmentOf,
  type GameEvent,
} from "@mighty/baseball-engine";
import { create } from "zustand";
import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { track } from "@/stats/track";

import { baseballKit } from "./kit";
import {
  autoAction,
  loadSecretBook,
  newSalt,
  type SecretBook,
  saveSecretBook,
} from "./secret";

export type BaseballLocalMatch = LocalMatch<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent,
  undefined
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type BaseballHost = MatchHost<BaseballView, Action, GameEvent> & {
  drain(): Snapshot<BaseballView, GameEvent>[];
};

export type BaseballSaved = SavedMatch<BaseballRules, Action, undefined> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
  /** 판마다 내 비밀(이 기기에만 있다) */
  secrets: SecretBook;
};

/** 컴퓨터가 묻거나 답한 것은 바로 보이지 않고 잠깐 기다렸다 보인다(생각하는 듯이) */
const BOT_DELAY_MS = 450;

const SAVE_KEY = "baseball-save";

function saveBaseball(saved: BaseballSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadBaseball(): BaseballSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as BaseballSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearBaseball(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

interface BaseballStore {
  host: BaseballHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: BaseballLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: BaseballView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  queue: Snapshot<BaseballView, GameEvent>[];
  level: number;
  notice: string | null;
  /** 튜토리얼 미션 대국: 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  /** 판마다 내 비밀(이 기기에만 있다) */
  secrets: SecretBook;
  newGame(options: {
    rules: BaseballRules;
    level: number;
    seed?: number;
  }): void;
  resume(saved: BaseballSaved): void;
  /** 튜토리얼 미션: 이 장면에서 입문 컴퓨터와 한다(나는 0번 자리) */
  startPractice(initialState: BaseballState): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: BaseballHost,
    seatNames: string[],
    stats: StatsTarget,
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  /** 이번 판 내 비밀 수를 정한다: 소금을 만들어 이 기기에 남기고 약속만 낸다 */
  chooseSecret(secret: string): SubmitResult;
  submit(action: Action): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 물음(과 그 뒤 컴퓨터 수)을 되돌린다 */
  undo(): boolean;
  canUndo(): boolean;
  leave(): void;
  clearNotice(): void;
}

/** 사건에 맞춰 소리를 낸다: 답(스트라이크·볼·아웃), 판 끝(이김·짐·비김) */
function cuesFor(events: readonly GameEvent[], me: number): void {
  for (const e of events) {
    if (e.type === "answered") {
      // 다 맞힌 답은 방망이 소리(뒤이어 판 끝 소리가 난다), 아니면 미트 소리
      playUiCue(
        e.strikes === e.guess.length
          ? "homerun"
          : e.strikes > 0
            ? "strike"
            : e.balls > 0
              ? "ball"
              : "pass",
      );
    }
    if (e.type === "roundEnded") {
      const r = e.result;
      const draw = r.kind === "draw" || (r.kind === "cheat" && r.seat === null);
      playUiCue(
        draw ? "roundEnd" : "seat" in r && r.seat === me ? "win" : "lose",
      );
    }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;
/** 비밀을 남기는 곳: 혼자 하기는 저장 파일, 온라인은 탭 저장소, 미션은 메모리 */
let secretKey: string | null = null;

function stop(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
  lastAuto = null;
}

export const useBaseball = create<BaseballStore>((set, get) => {
  /** 답하기·공개는 내 기기가 바로 낸다(사람이 셀 필요가 없다) */
  const autoAct = (): void => {
    const { host, view, queue, secrets } = get();
    if (!host || !view || queue.length > 0) return;
    const action = autoAction(view, secrets);
    if (!action) return;
    const key = `${view.roundNumber}:${view.guesses.length}:${action.type}`;
    if (lastAuto === key) return;
    lastAuto = key;
    const result = host.submit(action);
    if (!result.ok) set({ notice: result.error });
  };

  /** 쌓인 화면을 차례로 보인다. 컴퓨터가 묻거나 답한 것은 조금 기다렸다가 */
  const advance = (): void => {
    if (timer !== null) return;
    const next = get().queue[0];
    if (next === undefined) return;
    const host = get().host;
    const me = host?.seat ?? 0;
    // 컴퓨터 상대(혼자 하기)만 기다린다. 온라인 상대 수는 바로 보인다.
    const byBot =
      get().local !== null &&
      next.events.some(
        (e) =>
          (e.type === "guessed" && e.seat !== me) ||
          (e.type === "answered" && e.seat !== me),
      );
    const show = () => {
      timer = null;
      set({
        queue: get().queue.slice(1),
        view: next.view,
        events: next.events,
      });
      cuesFor(next.events, me);
      autoAct();
      advance();
    };
    if (byBot) timer = setTimeout(show, BOT_DELAY_MS);
    else show();
  };

  const persistSecrets = (secrets: SecretBook) => {
    if (secretKey?.startsWith("online:")) saveSecretBook(secretKey, secrets);
  };

  const attach = (
    host: BaseballHost,
    options: {
      local: BaseballLocalMatch | null;
      level: number;
      seatNames: string[] | null;
      /** 없으면 내 기록에 남기지 않는다(튜토리얼) */
      stats: StatsTarget | null;
      archive?: ArchiveTarget;
      secrets: SecretBook;
      key: string | null;
    },
  ) => {
    stop();
    const { local, level } = options;
    secretKey = options.key;
    const recorder = options.stats
      ? new StatsRecorder(baseballKit.stats, options.stats)
      : null;
    const practice = options.stats === null;
    const archiver = options.archive
      ? new ArchiveRecorder(baseballKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local && !practice)
        saveBaseball({ ...local.save(), level, secrets: get().secrets });
    };
    const first = host.drain();
    set({
      host,
      local,
      level,
      seatNames: options.seatNames,
      reconnecting: false,
      hostLeft: false,
      offlineSeats: [],
      view: host.current(),
      events: [],
      queue: [],
      notice: null,
      practice,
      secrets: options.secrets,
    });
    persist();
    for (const snapshot of first) {
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
    }
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
      set({ queue: [...get().queue, snapshot] });
      advance();
    });
    autoAct();
  };

  const newLocal = (
    rules: BaseballRules,
    seed: number,
    level: number,
    log?: BaseballSaved["log"],
  ): BaseballLocalMatch =>
    new LocalMatch(
      {
        kit: baseballKit,
        rules,
        seed,
        humanSeat: 0,
        bot: baseballBotFor(level),
        pace: browserPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (
    local: BaseballLocalMatch,
    level: number,
    seed: number,
    secrets: SecretBook,
  ) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "baseball", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "baseball",
        mode: "solo",
        key: `solo:${seed}`,
        seat: local.seat,
        seatNames: null,
        source: () => {
          const saved = local.save();
          return { rules: saved.rules, seed: saved.seed, log: saved.log };
        },
      },
      secrets,
      key: `solo:${seed}`,
    });

  return {
    host: null,
    local: null,
    seatNames: null,
    reconnecting: false,
    hostLeft: false,
    offlineSeats: [],
    view: null,
    events: [],
    queue: [],
    level: 1,
    notice: null,
    practice: false,
    secrets: {},

    newGame({ rules, level, seed: given }) {
      track("game-start", { game: "baseball", mode: "solo", level });
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      attachLocal(newLocal(rules, seed, level), level, seed, {});
    },

    resume(saved) {
      attachLocal(
        newLocal(saved.rules, saved.seed, saved.level, saved.log),
        saved.level,
        saved.seed,
        saved.secrets ?? {},
      );
    },

    startPractice(initialState) {
      const local: BaseballLocalMatch = new LocalMatch({
        kit: baseballKit,
        rules: initialState.rules,
        seed: Math.floor(Math.random() * 2 ** 31),
        humanSeat: 0,
        bot: baseballBotFor(0),
        pace: browserPace,
        initialState,
      });
      attach(local, {
        local,
        level: 0,
        seatNames: null,
        stats: null,
        secrets: {},
        key: null,
      });
    },

    attachOnline(host, seatNames, stats, archive) {
      attach(host, {
        local: null,
        level: get().level,
        seatNames,
        stats,
        ...(archive ? { archive } : {}),
        secrets: loadSecretBook(stats.key),
        key: stats.key,
      });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
    },

    chooseSecret(secret) {
      const view = get().view;
      if (view?.decision?.kind !== "commit")
        return { ok: false, error: "비밀 수를 정할 때가 아니다" };
      const material = { secret, salt: newSalt() };
      const secrets = { ...get().secrets, [view.roundNumber]: material };
      // 약속을 내기 전에 먼저 남긴다(새로고침해도 답할 수 있게).
      set({ secrets });
      persistSecrets(secrets);
      return get().submit({
        type: "commit",
        hash: commitmentOf(material.secret, material.salt),
      });
    },

    submit(action) {
      const host = get().host;
      if (!host) return { ok: false, error: "게임이 없다" };
      // 컴퓨터 수를 보여 주기 전에는 두지 않는다.
      if (get().queue.length > 0) return { ok: false, error: "잠깐만요" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    canUndo() {
      const { local, view, queue } = get();
      // 튜토리얼 장면은 기록으로 다시 만들 수 없어 무르지 않는다.
      if (
        !local ||
        !view ||
        get().practice ||
        queue.length > 0 ||
        view.phase !== "play" ||
        view.decision?.kind !== "guess"
      )
        return false;
      return view.guesses.some((g) => g.seat === local.seat);
    },

    undo() {
      const { local, level, secrets } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 물음까지 잘라 낸다(그 뒤 컴퓨터 답·물음과 내 답도 함께).
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === local.seat && last.action.type === "guess") break;
      }
      attachLocal(
        newLocal(saved.rules, saved.seed, level, log),
        level,
        saved.seed,
        secrets,
      );
      return true;
    },

    leave() {
      stop();
      secretKey = null;
      set({
        host: null,
        local: null,
        seatNames: null,
        view: null,
        queue: [],
        events: [],
        reconnecting: false,
        hostLeft: false,
        offlineSeats: [],
        practice: false,
        secrets: {},
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
