import {
  type Action,
  type GameEvent,
  type GostopRules,
  type GostopScenarioOptions,
  type GostopView,
  MATGO_RULES,
} from "@mighty/gostop-engine";
import { cardOf, GODORI, hasAll } from "@mighty/hwatu";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

export type GostopScenario = Omit<GostopScenarioOptions, "rules">;
export type GostopLesson = Lesson<
  GostopView,
  GameEvent,
  GostopScenario,
  Action
>;
type Context = MissionContext<GostopView, GameEvent>;

/** 튜토리얼은 맞고 한 판으로 한다 */
export const GOSTOP_TUTORIAL_RULES: GostopRules = { ...MATGO_RULES, rounds: 1 };

/**
 * 내 첫 차례의 사건들(내가 낸 뒤 다른 사람이 내기 전까지). 아직 안 냈으면 null.
 * 고르기·고·스톱이 남았으면 `done`이 false다
 */
function myTurn({
  view,
  events,
}: Context): { events: GameEvent[]; done: boolean } | null {
  const me = view.mySeat;
  const start = events.findIndex(
    (e) => (e.type === "played" || e.type === "bombed") && e.seat === me,
  );
  if (start < 0) return null;
  const out: GameEvent[] = [];
  for (const e of events.slice(start)) {
    if ((e.type === "played" || e.type === "bombed") && e.seat !== me)
      return { events: out, done: true };
    out.push(e);
  }
  const done =
    view.phase !== "play" || view.turn !== me || view.decision?.kind === "play";
  return { events: out, done };
}

/** 내 첫 차례에 먹은 카드 */
function capturedInTurn(ctx: Context): string[] | null {
  const turn = myTurn(ctx);
  if (!turn?.done) return null;
  return turn.events.flatMap((e) =>
    e.type === "captured" && e.seat === ctx.view.mySeat ? e.cards : [],
  );
}

/** 고·스톱 미션: 스톱하면(그리고 `extra`를 만족하면) 성공, 고를 부르거나 점수 없이 차례가 넘어가면 실패 */
function stopMission(
  extra: (ctx: Context) => boolean = () => true,
): (ctx: Context) => MissionStatus {
  return (ctx) => {
    const me = ctx.view.mySeat;
    if (ctx.events.some((e) => e.type === "go" && e.seat === me)) return "fail";
    if (ctx.events.some((e) => e.type === "stopped" && e.seat === me))
      return extra(ctx) ? "success" : "fail";
    const turn = myTurn(ctx);
    return turn?.done ? "fail" : null;
  };
}

export const GOSTOP_LESSONS: readonly GostopLesson[] = [
  {
    id: "goal",
    title: "고스톱은 어떤 게임?",
    summary: "같은 달끼리 짝을 맞춰 먹고, 뒤집어서 또 먹는다",
    steps: [
      {
        kind: "explain",
        title: "화투 48장",
        body: [
          "화투는 **12달 × 4장 = 48장**이에요. 카드 왼쪽 위 숫자가 달이에요.",
          "둘이 하면 **맞고**: 10장씩 나눠 갖고 바닥에 8장을 깔아요. 셋이 하면 7장씩, 바닥에 6장이에요.",
          "나머지는 엎어서 **더미**로 쌓아 둬요.",
        ],
        scene: {
          hands: [["01g", "03r", "08a", "11d"], []],
          floor: ["01p", "05p", "08p", "12a"],
          deck: [],
        },
      },
      {
        kind: "explain",
        title: "한 차례: 내고, 뒤집기",
        body: [
          "손패 한 장을 내요. 바닥에 **같은 달** 카드가 있으면 둘을 함께 **먹어요**. 없으면 바닥에 놓여요.",
          "그다음 더미 맨 위를 **뒤집어요**. 뒤집은 카드도 같은 달이 바닥에 있으면 먹어요.",
          "같은 달이 바닥에 둘이면 어느 것을 먹을지 골라요.",
        ],
      },
      {
        kind: "explain",
        title: "뻑·쪽·따닥·싹쓸이",
        body: [
          "**뻑**: 먹으려던 달이 뒤집혀 또 나오면 석 장이 바닥에 남아요. 나중에 넷째 장으로 먹으면 피를 한 장씩 받아요.",
          "**쪽**: 바닥에 놓은 카드를 뒤집은 카드가 바로 먹으면 상대마다 피 한 장을 받아요.",
          "**따닥**: 같은 달 둘이 깔린 데에 내고 넷째가 뒤집혀 나오면 넉 장을 다 먹고 피를 받아요.",
          "**싹쓸이**: 바닥을 다 쓸어도 피 한 장씩 받아요.",
        ],
      },
      {
        kind: "quiz",
        question: "3월 광을 냈는데 바닥에 3월 카드가 없어요. 어떻게 될까요?",
        options: ["바닥에 놓인다", "버려진다", "다시 낸다"],
        answer: 0,
        explain:
          "짝이 없으면 바닥에 놓여요. 뒤집은 카드가 3월이면 쪽으로 바로 먹을 수도 있어요.",
      },
      {
        kind: "mission",
        title: "짝 맞추기",
        objective: "바닥과 **같은 달** 카드를 내서 먹으세요.",
        hint: "바닥에 3월 피가 있어요. 손에 3월 카드가 있나요?",
        scenario: {
          hands: [
            ["03g", "07p", "11p"],
            ["10p", "10q", "12d"],
          ],
          floor: ["03p", "05p", "09q", "04p"],
          deck: ["06p", "06q", "02p", "02q", "01p", "01q"],
        },
        check: (ctx) => {
          const got = capturedInTurn(ctx);
          if (got === null) return null;
          return got.includes("03g") ? "success" : "fail";
        },
        success: "3월 광과 3월 피를 함께 먹었어요!",
        fail: "짝이 없는 카드는 바닥에 놓이기만 해요. 같은 달을 찾아 보세요.",
        solution: [{ type: "play", card: "03g" }],
        mistake: [{ type: "play", card: "07p" }],
      },
    ],
  },
  {
    id: "points",
    title: "점수: 광·열끗·띠·피",
    summary: "먹은 패를 종류별로 모아 점수를 낸다",
    steps: [
      {
        kind: "explain",
        title: "광",
        body: [
          "광은 1·3·8·11·12월에 한 장씩, 다섯 장이에요(붉은 光 표시).",
          "**3광 3점**, 4광 4점, 5광 15점. 12월 비광이 섞인 3광은 2점이에요.",
        ],
        scene: {
          hands: [[], []],
          floor: [],
          deck: [],
          captured: [["01g", "03g", "08g"], []],
        },
      },
      {
        kind: "explain",
        title: "열끗·띠·피",
        body: [
          "**열끗**(동물·물건)과 **띠**는 5장이면 1점, 한 장 더할 때마다 1점씩 올라요.",
          "**피**는 10장이면 1점, 한 장마다 1점씩. **쌍피**(×2)는 두 장으로 세요.",
          "9월 국진(술잔)은 열끗이지만, 옵션에 따라 쌍피로 셀 수도 있어요.",
        ],
        scene: {
          hands: [[], []],
          floor: [],
          deck: [],
          captured: [["05a", "06a", "07a", "10a", "12a", "11d", "12d"], []],
        },
      },
      {
        kind: "quiz",
        question: "피 8장과 쌍피 1장을 먹었어요. 피 점수는?",
        options: ["0점", "1점", "2점"],
        answer: 1,
        explain: "쌍피는 두 장이라 피가 10장, 1점이에요.",
      },
      {
        kind: "mission",
        title: "3광 만들기",
        objective: "광 두 장을 먹었어요. **셋째 광**을 먹어 3점을 내세요.",
        hint: "바닥에 8월 광이 있어요.",
        scenario: {
          hands: [
            ["08p", "05p", "06q"],
            ["10q", "11q", "12d"],
          ],
          floor: ["08g", "10p", "11p", "02p"],
          deck: ["09p", "04p", "04q", "07p", "07q", "01p"],
          captured: [["01g", "03g"], []],
        },
        check: (ctx) => {
          const got = capturedInTurn(ctx);
          if (got === null) return null;
          return got.includes("08g") ? "success" : "fail";
        },
        success: "3광 3점! 광은 모일수록 점수가 커요.",
        fail: "8월 광을 그냥 두면 상대가 먹을 수도 있어요. 8월 카드로 먹어 보세요.",
        solution: [{ type: "play", card: "08p" }],
        mistake: [{ type: "play", card: "05p" }],
      },
    ],
  },
  {
    id: "yak",
    title: "약: 고도리·홍단·청단·초단",
    summary: "정해진 세 장을 모으면 큰 점수",
    steps: [
      {
        kind: "explain",
        title: "고도리 5점",
        body: [
          "2월 꾀꼬리, 4월 두견새, 8월 기러기. 새 세 마리를 다 모으면 **고도리 5점**이에요.",
        ],
        scene: {
          hands: [[], []],
          floor: [],
          deck: [],
          captured: [["02a", "04a", "08a"], []],
        },
      },
      {
        kind: "explain",
        title: "단 3점",
        body: [
          "**홍단**: 1·2·3월 붉은 띠. **청단**: 6·9·10월 파란 띠. **초단**: 4·5·7월 풀 띠. 각각 3점이에요.",
          "상대가 그중 한 장이라도 먹으면 그 약은 못 만들어요. 그래서 막는 것도 중요해요.",
        ],
        scene: {
          hands: [[], []],
          floor: [],
          deck: [],
          captured: [["01r", "02r", "03r", "06r", "09r", "10r"], []],
        },
      },
      {
        kind: "quiz",
        question: "홍단은 몇 월 띠일까요?",
        options: ["1·2·3월", "4·5·7월", "6·9·10월"],
        answer: 0,
        explain: "홍단은 1·2·3월 붉은 띠예요. 4·5·7월은 초단, 6·9·10월은 청단.",
      },
      {
        kind: "mission",
        title: "고도리",
        objective:
          "새 두 마리를 먹었어요. **셋째 새**를 먹어 고도리를 만드세요.",
        hint: "바닥에 8월 기러기가 있어요.",
        scenario: {
          hands: [
            ["08p", "06p", "07q"],
            ["10q", "11q", "12d"],
          ],
          floor: ["08a", "01p", "11p", "05q"],
          deck: ["09p", "04p", "04q", "03p", "03q", "02p"],
          captured: [["02a", "04a"], []],
        },
        check: (ctx) => {
          const got = capturedInTurn(ctx);
          if (got === null) return null;
          const mine = ctx.view.captured[ctx.view.mySeat] ?? [];
          return got.includes("08a") && hasAll(mine, GODORI)
            ? "success"
            : "fail";
        },
        success: "고도리 5점!",
        fail: "기러기를 놓치면 상대가 막을 수 있어요. 8월 카드로 먹어 보세요.",
        solution: [{ type: "play", card: "08p" }],
        mistake: [{ type: "play", card: "06p" }],
      },
    ],
  },
  {
    id: "gostop",
    title: "고·스톱",
    summary: "점수가 나면 더 할지(고) 끝낼지(스톱) 고른다",
    steps: [
      {
        kind: "explain",
        title: "고 또는 스톱",
        body: [
          "맞고는 **7점**, 셋이 하면 **3점**이 나면 고르기 창이 떠요.",
          "**스톱**: 지금 점수로 이겨요. 진 사람이 점수만큼 내요.",
          "**고**: 판을 이어 가요. 1고 +1점, 2고 +2점, 3고부터는 두 배씩! 다만 고를 부르고 남이 먼저 나면 **고박**으로 두 배를 물어요.",
          "고를 부른 뒤에는 점수가 더 나야 다시 물어요.",
        ],
      },
      {
        kind: "explain",
        title: "흔들기·폭탄·총통",
        body: [
          "**흔들기**: 같은 달 석 장을 들고 바닥에 그 달이 없으면, 보여 주고 내서 점수를 두 배로 해요.",
          "**폭탄**: 같은 달 석 장을 들고 바닥에 한 장이 있으면 석 장을 한꺼번에 내 넉 장을 먹어요. 두 배에 피도 받고, 다음 두 차례는 뒤집기만 해요.",
          "**총통**: 처음 받은 패에 같은 달 넉 장이면 바로 10점으로 이겨요.",
        ],
      },
      {
        kind: "quiz",
        question: "점수 8점에서 2고를 부르고 이겼어요. 몇 점일까요?",
        options: ["8점", "10점", "16점"],
        answer: 1,
        explain: "2고는 +2점이라 10점이에요. 3고부터 두 배가 돼요.",
      },
      {
        kind: "mission",
        title: "스톱할 때",
        objective: "상대가 벌써 6점이에요. 점수를 내고 **스톱**해서 이기세요.",
        hint: "8월 기러기를 먹으면 고도리와 홍단으로 8점이에요.",
        scenario: {
          hands: [
            ["08p", "05p", "06q"],
            ["10q", "11q", "12d"],
          ],
          floor: ["08a", "07p", "04p"],
          deck: ["09p", "12r", "12a", "09q", "04q", "03q"],
          captured: [
            ["01r", "02r", "03r", "02a", "04a"],
            ["01g", "03g", "11g", "06r", "09r", "10r"],
          ],
        },
        check: stopMission(),
        success: "스톱! 상대가 가까울 때는 욕심내지 않는 게 좋아요.",
        fail: "상대가 6점이라 고를 부르면 고박을 쓸 수 있어요. 점수를 내고 스톱해 보세요.",
        solution: [{ type: "play", card: "08p" }, { type: "stop" }],
        mistake: [{ type: "play", card: "08p" }, { type: "go" }],
      },
    ],
  },
  {
    id: "bak",
    title: "박",
    summary: "진 사람이 두 배로 내는 경우",
    steps: [
      {
        kind: "explain",
        title: "피박·광박·멍박·고박",
        body: [
          "**피박**: 이긴 사람이 피로 점수를 냈는데 진 사람 피가 5장이 안 되면 두 배.",
          "**광박**: 이긴 사람이 광으로 점수를 냈는데 진 사람이 광이 하나도 없으면 두 배.",
          "**멍박**: 이긴 사람 열끗이 7장 이상이면 두 배.",
          "**고박**: 고를 부르고 진 사람은 두 배. 셋이 하면 진 사람 몫까지 혼자 내요(독박).",
          "박은 겹치면 또 두 배가 돼요. 아무도 못 나면 **나가리**, 다음 판이 두 배예요.",
        ],
      },
      {
        kind: "quiz",
        question:
          "내가 3광으로 이겼고 상대는 광이 하나도 없어요. 무슨 박일까요?",
        options: ["피박", "광박", "고박"],
        answer: 1,
        explain: "이긴 사람이 광 점수를 냈고 진 사람이 광이 없으면 광박이에요.",
      },
      {
        kind: "mission",
        title: "광박 씌우기",
        objective:
          "상대는 광이 없어요. **셋째 광**을 먹고 스톱해 광박을 씌우세요.",
        hint: "8월 광을 먹으면 3광 + 홍단 + 띠로 7점이에요.",
        scenario: {
          hands: [
            ["08p", "06p", "07q"],
            ["10q", "11q", "12d"],
          ],
          floor: ["08g", "10p", "11p"],
          deck: ["09q", "04p", "04q", "03p", "03q", "02p"],
          captured: [
            ["01g", "03g", "01r", "02r", "03r", "04r", "05r"],
            ["09p", "06q"],
          ],
        },
        check: stopMission((ctx) => {
          const ended = ctx.events.find((e) => e.type === "roundEnded");
          return (
            ended?.type === "roundEnded" &&
            ended.settlement.winner === ctx.view.mySeat &&
            ended.settlement.baks.some((b) => b.includes("gwang"))
          );
        }),
        success: "광박! 상대가 두 배로 내요.",
        fail: "8월 광을 먹어 점수를 내고 스톱해야 광박이에요.",
        solution: [{ type: "play", card: "08p" }, { type: "stop" }],
        mistake: [{ type: "play", card: "06p" }],
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "입문 컴퓨터와 맞고 한 판",
    steps: [
      {
        kind: "explain",
        title: "처음부터 한 판",
        body: [
          "이제 입문 컴퓨터와 맞고 한 판을 끝까지 해 봐요.",
          "손패를 누르면 짝이 맞는 바닥 카드가 빛나요. 한 번 더 누르면 내요.",
        ],
      },
      {
        kind: "mission",
        title: "맞고 한 판",
        objective: "입문 컴퓨터와 **한 판을 끝까지** 해 보세요.",
        hint: "점수가 가까운 상대가 있으면 스톱이 안전해요.",
        scenario: null,
        check: ({ events, view }) => {
          const ended = events.find((e) => e.type === "roundEnded");
          if (ended?.type !== "roundEnded") return null;
          return ended.settlement.winner === null ||
            ended.settlement.winner === view.mySeat
            ? "success"
            : "fail";
        },
        success: "한 판을 끝냈어요! 이제 나홀로 고스톱으로 실력을 키워 보세요.",
        fail: "아쉽게 졌어요. 다시 해 볼까요?",
      },
    ],
  },
];

/** 카드 번호 목록이 화투 카드인지(시험) */
export function scenarioCards(s: GostopScenario): string[] {
  return [
    ...s.hands.flat(),
    ...s.floor,
    ...s.deck,
    ...(s.captured ?? []).flat(),
  ].map((id) => cardOf(id).id);
}
