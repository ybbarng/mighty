import type { Card } from "@mighty/engine";
import {
  type Action,
  type GameEvent,
  type HeartsScenarioOptions,
  isHeart,
  type PlayerView,
  WINDOWS_RULES,
} from "@mighty/hearts-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

export type HeartsScenario = Omit<HeartsScenarioOptions, "rules">;
export type HeartsLesson = Lesson<
  PlayerView,
  GameEvent,
  HeartsScenario,
  Action
>;
type Context = MissionContext<PlayerView, GameEvent>;

/** 튜토리얼은 윈도우 하트 규칙으로 한다 */
export const HEARTS_TUTORIAL_RULES = WINDOWS_RULES;

/** 내가 낸 첫 카드 */
function myPlay({ view, events }: Context) {
  const played = events.find(
    (e) => e.type === "played" && e.seat === view.seat,
  );
  return played?.type === "played" ? played.card : null;
}

/** 첫 턴이 끝났을 때 내가 먹지 않았으면 성공 */
function dodgedTrick({ view, events }: Context): MissionStatus {
  const won = events.find((e) => e.type === "trickWon");
  if (won?.type !== "trickWon") return null;
  return won.seat === view.seat ? "fail" : "success";
}

export const HEARTS_LESSONS: readonly HeartsLesson[] = [
  {
    id: "goal",
    title: "하트는 어떤 게임?",
    summary: "점수 카드를 피하고, 적게 먹은 사람이 이긴다",
    steps: [
      {
        kind: "explain",
        title: "네 명, 13장씩",
        body: [
          "하트는 네 명이 트럼프 52장을 13장씩 나눠 갖고 하는 카드 게임이에요.",
          "모두가 한 장씩 내는 한 바퀴를 **턴**이라고 해요. 13턴이면 한 판이 끝나요.",
          "턴에서 가장 센 카드를 낸 사람이 그 턴의 카드 4장을 모두 **먹어요**.",
        ],
      },
      {
        kind: "explain",
        title: "점수는 낮을수록 좋아요",
        body: [
          "먹은 카드 중 **하트는 한 장에 1점**, **스페이드 Q는 혼자 13점**이에요. 나머지 카드는 0점이에요.",
          "판마다 점수를 더해 가다가 누군가 **100점**을 넘으면 게임이 끝나요. 그때 점수가 **가장 낮은** 사람이 이겨요.",
          "그래서 하트는 카드를 먹는 게임이 아니라 **피하는** 게임이에요.",
        ],
        cards: ["H2", "H10", "HA", "SQ"],
      },
      {
        kind: "explain",
        title: "무늬를 따라 내요",
        body: [
          "턴을 처음 여는 사람을 **선**이라고 해요. 다른 사람은 선이 낸 무늬가 손에 있으면 **반드시 그 무늬를** 내야 해요.",
          "선 무늬 중 **가장 높은 카드**를 낸 사람이 먹어요. 마이티와 달리 기루다(으뜸 무늬)가 없어서, 다른 무늬는 아무리 높아도 이기지 못해요.",
          "선 무늬가 없을 때는 아무 카드나 낼 수 있어요. 이때가 하트나 스페이드 Q를 **남에게 떠넘길** 기회예요.",
        ],
      },
      {
        kind: "explain",
        title: "첫 턴",
        body: [
          "첫 턴은 **클로버 2**를 가진 사람이 클로버 2를 내며 시작해요.",
          "첫 턴에는 무늬가 없어도 하트와 스페이드 Q를 버릴 수 없어요(그것밖에 없을 때만 예외).",
        ],
        cards: ["C2"],
      },
      {
        kind: "quiz",
        question: "한 판에 하트 3장과 스페이드 Q를 먹었어요. 몇 점일까요?",
        options: ["3점", "13점", "16점"],
        answer: 2,
        explain: "하트 3장은 3점, 스페이드 Q는 13점이라 모두 16점이에요.",
      },
      {
        kind: "quiz",
        question: "한 판의 첫 카드는 무엇일까요?",
        options: ["클로버 2", "클로버 A", "하트 2"],
        answer: 0,
        explain: "클로버 2를 가진 사람이 클로버 2를 내며 첫 턴을 열어요.",
      },
      {
        kind: "mission",
        title: "하트 떠넘기기",
        objective:
          "다이아몬드 턴인데 나는 다이아몬드가 없어요. **하트를 남에게 떠넘기세요.**",
        hint: "다이아몬드 K를 낸 사람이 이 턴을 먹어요. 하트 A를 내면 그 사람이 1점을 가져가요.",
        scenario: {
          phase: "play",
          leader: 1,
          trick: ["D5", "DK", "D3"],
          hands: [["HA", "C4"], ["C2"], ["C3"], ["C5"]],
        },
        check: (ctx) => {
          const card = myPlay(ctx);
          if (card === null) return null;
          return isHeart(card) ? "success" : "fail";
        },
        success:
          "하트 A가 다이아몬드 K를 낸 사람에게 갔어요. 무늬가 없을 때는 점수 카드를 버릴 기회예요!",
        fail: "클로버를 내면 하트 A가 손에 남아 나중에 내가 먹을 수도 있어요. 무늬가 없을 때 하트를 버려 보세요.",
        solution: [{ type: "play", card: "HA" }],
        mistake: [{ type: "play", card: "C4" }],
      },
    ],
  },
  {
    id: "pass",
    title: "카드 넘기기",
    summary: "판을 시작하기 전에 위험한 카드 3장 넘기기",
    steps: [
      {
        kind: "explain",
        title: "3장씩 넘겨요",
        body: [
          "카드를 받으면 내기 전에 **3장을 골라 다른 사람에게 넘겨요.** 모두 동시에 넘기고, 나도 3장을 받아요.",
          "넘기는 방향은 판마다 **왼쪽 → 오른쪽 → 맞은편 → 안 넘김** 차례로 돌아요.",
        ],
      },
      {
        kind: "explain",
        title: "무엇을 넘길까",
        body: [
          "**스페이드 Q**, 그리고 Q를 먹게 만드는 **스페이드 K·A**가 1순위예요. 단, 낮은 스페이드가 여러 장 있으면 스페이드 Q를 쥐고 버틸 수도 있어요.",
          "**높은 하트**도 넘기기 좋아요. 높은 카드일수록 턴을 먹기 쉬우니까요.",
          "한 무늬를 모두 넘겨 **비워 두면**, 그 무늬가 나올 때마다 점수 카드를 버릴 수 있어요.",
        ],
        cards: ["SQ", "SK", "SA", "HA"],
      },
      {
        kind: "quiz",
        question: "네 번째 판에는 카드를 어떻게 넘길까요?",
        options: ["왼쪽", "맞은편", "넘기지 않는다"],
        answer: 2,
        explain:
          "왼쪽 → 오른쪽 → 맞은편 다음 네 번째 판은 넘기지 않고 바로 해요.",
      },
      {
        kind: "mission",
        title: "위험한 카드 넘기기",
        objective:
          "스페이드 Q·K·A가 있는데 **낮은 스페이드가 없어요.** 이번 판은 왼쪽으로 넘겨요. **위험한 카드 3장**을 넘기세요.",
        hint: "낮은 스페이드가 없으면 스페이드 Q를 지킬 수 없어요. 스페이드 Q·K·A를 고르세요.",
        scenario: {
          phase: "passing",
          direction: "left",
          fill: true,
          hands: [
            [
              "SQ",
              "SK",
              "SA",
              "C3",
              "C5",
              "C8",
              "D2",
              "D6",
              "D9",
              "DJ",
              "H2",
              "H4",
              "H7",
            ],
            [],
            [],
            [],
          ],
        },
        check: ({ view }) => {
          if (view.myPass === null) return null;
          const risky: Card[] = ["SQ", "SK", "SA"];
          return risky.every((c) => view.myPass?.includes(c))
            ? "success"
            : "fail";
        },
        success:
          "위험한 스페이드를 모두 넘겼어요. 이제 스페이드 턴이 와도 스페이드 Q를 먹을 걱정이 줄었어요!",
        fail: "스페이드 Q를 지킬 낮은 스페이드가 없으니, 스페이드 Q와 그것을 먹게 만드는 K·A를 넘기는 게 안전해요.",
        solution: [{ type: "pass", cards: ["SQ", "SK", "SA"] }],
        mistake: [{ type: "pass", cards: ["C3", "C5", "C8"] }],
      },
    ],
  },
  {
    id: "queen",
    title: "스페이드 Q와 하트 깨기",
    summary: "13점짜리를 피하고, 하트로 선을 잡는 때",
    steps: [
      {
        kind: "explain",
        title: "하트 깨기",
        body: [
          "누군가 하트를 버리기 전까지는 **하트로 선을 잡을 수 없어요.** 처음 하트가 나오는 것을 **하트가 깨졌다**고 해요.",
          "손에 하트밖에 없으면 예외로 하트를 내도 돼요.",
          "게임 화면에서는 지금 낼 수 있는 카드만 밝게 보여요.",
        ],
      },
      {
        kind: "explain",
        title: "스페이드 Q 피하기",
        body: [
          "스페이드 턴에서 스페이드 Q가 나왔다면, **그보다 낮은 스페이드**를 내서 피하세요. K나 A를 내면 13점을 떠안아요.",
          "스페이드 Q가 아직 안 나왔다면, 낮은 스페이드로 선을 잡아 가진 사람이 Q를 내게 만들 수도 있어요.",
        ],
        cards: ["SQ", "SK", "S3"],
      },
      {
        kind: "quiz",
        question:
          "아직 하트가 깨지지 않았고 내가 선이에요. 손에 하트와 다이아몬드가 있다면 무엇을 낼 수 있을까요?",
        options: ["하트만", "다이아몬드만", "아무거나"],
        answer: 1,
        explain:
          "하트가 깨지기 전에는 하트로 선을 잡을 수 없어요. 다이아몬드를 내야 해요.",
      },
      {
        kind: "mission",
        title: "스페이드 Q 피하기",
        objective:
          "스페이드 턴에 누군가 **스페이드 Q**를 냈어요. 나는 스페이드 K와 3이 있어요. **13점을 피하세요.**",
        hint: "스페이드 Q보다 낮은 스페이드 3을 내면, 스페이드 Q를 낸 사람이 그대로 먹어요.",
        scenario: {
          phase: "play",
          leader: 1,
          trick: ["S5", "SQ", "S2"],
          hands: [
            ["SK", "S3", "D4"],
            ["C6", "C7"],
            ["C8", "C9"],
            ["C10", "CJ"],
          ],
        },
        check: dodgedTrick,
        success:
          "스페이드 Q를 낸 사람이 스스로 13점을 먹었어요. 높은 스페이드는 아껴 두세요!",
        fail: "스페이드 K는 스페이드 Q보다 높아서 13점이 나에게 왔어요. 낮은 스페이드로 피해 보세요.",
        solution: [{ type: "play", card: "S3" }],
        mistake: [{ type: "play", card: "SK" }],
      },
    ],
  },
  {
    id: "moon",
    title: "문 쏘기",
    summary: "점수 카드를 몽땅 먹는 역전, 그리고 막기",
    steps: [
      {
        kind: "explain",
        title: "문 쏘기",
        body: [
          "한 판에 **하트 13장과 스페이드 Q를 모두** 먹으면 **문을 쐈다**(Shooting the Moon)고 해요.",
          "그러면 나는 0점이고, **다른 세 사람이 26점씩** 받아요. 크게 뒤지고 있을 때 노리는 한 방이에요.",
          "높은 하트와 높은 카드를 많이 들었을 때 노려 볼 만해요. 하지만 한 장이라도 놓치면 고스란히 점수를 떠안아요.",
        ],
      },
      {
        kind: "explain",
        title: "문 막기",
        body: [
          "누군가 하트를 계속 먹고 있다면 문을 노리는 걸 수도 있어요.",
          "그럴 땐 **하트 한 장만 내가 먹어도** 문은 막혀요. 1점을 먹고 26점을 피하는 셈이에요.",
        ],
      },
      {
        kind: "quiz",
        question: "한 사람이 하트 13장과 스페이드 Q를 모두 먹으면?",
        options: [
          "그 사람이 26점",
          "나머지 세 사람이 26점씩",
          "아무도 점수를 받지 않는다",
        ],
        answer: 1,
        explain:
          "문을 쏜 사람은 0점, 다른 세 사람이 26점씩 받아요(윈도우 하트 규칙).",
      },
      {
        kind: "quiz",
        question:
          "한 사람이 하트를 모두 먹어 가고 있어요. 문을 막으려면 어떻게 할까요?",
        options: [
          "하트 한 장이라도 내가 먹는다",
          "하트를 끝까지 아껴 둔다",
          "스페이드 Q를 그 사람에게 준다",
        ],
        answer: 0,
        explain:
          "하트 한 장이라도 다른 사람이 먹으면 문은 실패예요. 1점을 먹고 26점을 막아요.",
      },
    ],
  },
];
