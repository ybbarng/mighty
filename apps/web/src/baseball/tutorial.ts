import {
  type Action,
  type BaseballScenarioOptions,
  type BaseballView,
  type GameEvent,
  PUZZLE_RULES,
} from "@mighty/baseball-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 컴퓨터 비밀과 이미 물어본 수. 그림에서 비밀을 보일지 정한다 */
export type BaseballScene = Omit<BaseballScenarioOptions, "rules"> & {
  /** 설명 그림에서 비밀 수를 보인다(답이 어떻게 나오는지 보여 줄 때) */
  showSecret?: boolean;
};
export type BaseballLesson = Lesson<
  BaseballView,
  GameEvent,
  BaseballScene,
  Action
>;
type Context = MissionContext<BaseballView, GameEvent>;

/** 튜토리얼은 세 자리·1~9 퍼즐로 한다 */
export const BASEBALL_TUTORIAL_RULES = PUZZLE_RULES;

/** 미션에서 내가 물어 답을 받은 것들 */
function myAnswers({ view, events }: Context) {
  return events.filter(
    (e): e is Extract<GameEvent, { type: "answered" }> =>
      e.type === "answered" && e.guesser === view.mySeat,
  );
}

/** `limit`번 안에 맞히면 성공, 그만큼 물어도 못 맞히거나 그만두면 실패 */
function solveWithin(limit: number) {
  return (ctx: Context): MissionStatus => {
    const answers = myAnswers(ctx);
    const digits = ctx.view.rules.digits;
    const hit = answers.findIndex((a) => a.strikes === digits);
    if (hit >= 0) return hit < limit ? "success" : "fail";
    if (answers.length >= limit) return "fail";
    const ended = ctx.events.find((e) => e.type === "roundEnded");
    return ended ? "fail" : null;
  };
}

const guess = (g: string): Action => ({ type: "guess", guess: g });

/** 123에 1S, 456·789에 1B씩, 735는 세 숫자가 다 있다 → 573 하나만 남는다 */
const ONE_LEFT: BaseballScene = {
  secret: "573",
  guesses: ["123", "456", "789", "735"],
};

/** 234·678이 아웃이라 1·5·9만 남고, 자리를 두 번 다 틀려 915 하나만 남는다 */
const OUTS: BaseballScene = {
  secret: "915",
  guesses: ["234", "678", "159", "591"],
};

/** 1·2·4·5·7·9가 빠지고 3·6·8만 남는다. 638은 셋 다 자리가 틀려 386·863 둘이 남는다 */
const TWO_LEFT: BaseballScene = {
  secret: "386",
  guesses: ["124", "579", "638"],
};

export const BASEBALL_LESSONS: readonly BaseballLesson[] = [
  {
    id: "goal",
    title: "숫자야구는 어떤 게임?",
    summary: "상대가 숨긴 세 자리 수를 묻고 답을 들으며 맞힌다",
    steps: [
      {
        kind: "explain",
        title: "숨긴 수를 맞혀요",
        body: [
          "두 사람이 각자 **서로 다른 숫자 세 개**로 된 비밀 수를 정해요. 예를 들어 **382**처럼요(같은 숫자를 두 번 쓰지 않아요).",
          "번갈아 상대 수를 짐작해 **물어보면**, 상대가 얼마나 맞았는지 **답**해 줘요.",
          "상대 수를 **먼저 다 맞히는** 사람이 이겨요.",
        ],
      },
      {
        kind: "explain",
        title: "답은 스트라이크와 볼",
        body: [
          "숫자와 **자리까지 맞으면 스트라이크(S)**, 숫자는 있는데 **자리가 다르면 볼(B)**이에요.",
          "하나도 없으면 **아웃**이에요. 세 자리가 다 맞으면 **3S**, 맞힌 거예요.",
          "그림은 비밀 수가 **382**일 때 **352**를 물은 모습이에요. 3과 2는 자리까지 맞아 **2S**예요.",
        ],
        scene: { secret: "382", guesses: ["352"], showSecret: true },
      },
      {
        kind: "quiz",
        question: "비밀 수가 **123**일 때 **132**를 물으면 답은?",
        options: ["1S 2B", "3B", "2S 1B", "3S"],
        answer: 0,
        explain:
          "1은 자리까지 맞아 **1S**, 3과 2는 숫자만 있고 자리가 달라 **2B**예요.",
      },
      {
        kind: "mission",
        title: "하나 남은 수",
        objective:
          "네 번 물어본 답이 있어요. 답과 모두 맞는 수는 **하나뿐**이에요. 그 수를 물어 맞히세요.",
        hint: "735에 3B니 **7·3·5**가 모두 있어요. 123에 1S였으니 **3은 셋째 자리**예요.",
        scenario: ONE_LEFT,
        check: solveWithin(1),
        success: "맞혔어요! 답을 하나씩 모으면 후보가 줄어 결국 하나가 남아요.",
        fail: "아쉬워요. 735의 세 숫자를 쓰되, 123의 1S로 3의 자리를 정해 보세요.",
        solution: [guess("573")],
        mistake: [guess("753")],
      },
    ],
  },
  {
    id: "out",
    title: "아웃으로 숫자 지우기",
    summary: "아웃이면 물어본 숫자가 하나도 없다. 남은 숫자만 생각한다",
    steps: [
      {
        kind: "explain",
        title: "아웃은 좋은 단서",
        body: [
          "**아웃**은 물어본 세 숫자가 **하나도 없다**는 뜻이에요. 그 숫자들은 지워도 돼요.",
          "두 번 아웃이 나오면 1~9 가운데 여섯 개가 빠지고 **세 개만** 남아요. 이제 자리만 찾으면 돼요.",
        ],
        scene: { secret: "915", guesses: ["234", "678"] },
      },
      {
        kind: "quiz",
        question: "234도 아웃, 678도 아웃이에요. 비밀 수에 꼭 있는 숫자는?",
        scene: { secret: "915", guesses: ["234", "678"] },
        options: ["1·5·9", "2·4·6", "3·7·8", "알 수 없다"],
        answer: 0,
        explain:
          "2·3·4·6·7·8이 모두 빠졌으니 남은 **1·5·9**가 세 자리를 채워요.",
      },
      {
        kind: "mission",
        title: "자리 찾기",
        objective:
          "1·5·9만 남았고, 159와 591은 세 숫자 모두 **자리가 틀렸어요**(0S 3B). 맞는 자리를 찾아 한 번에 맞히세요.",
        hint: "1은 첫째·셋째가 아니고, 5는 둘째·첫째가 아니에요. 그러면 **5는 셋째**예요.",
        scenario: OUTS,
        check: solveWithin(1),
        success:
          "맞혔어요! 볼만 나온 수는 숫자마다 갈 수 없는 자리를 알려 줘요.",
        fail: "아쉬워요. 159·591에서 각 숫자가 있었던 자리는 정답 자리가 아니에요.",
        solution: [guess("915")],
        mistake: [guess("195")],
      },
    ],
  },
  {
    id: "narrow",
    title: "후보 좁히기",
    summary: "남은 후보를 세고, 후보 가운데 하나를 물어 좁힌다",
    steps: [
      {
        kind: "explain",
        title: "남은 후보 세기",
        body: [
          "지금까지 받은 답과 **모두 맞는 수**가 남은 후보예요. 게임 화면 아래에 **후보 수**를 보여 줘요(옵션에서 끌 수 있어요).",
          "후보 가운데 하나를 물으면 **맞힐 수도 있고**, 틀려도 후보가 크게 줄어요.",
        ],
        scene: TWO_LEFT,
      },
      {
        kind: "quiz",
        question: "그림의 답으로 남는 후보는 몇 개일까요?",
        scene: TWO_LEFT,
        options: ["2개(386·863)", "1개", "3개", "6개"],
        answer: 0,
        explain:
          "3·6·8만 남았는데 638은 세 숫자 모두 자리가 틀렸어요. 그러면 **386**과 **863** 둘만 남아요.",
      },
      {
        kind: "mission",
        title: "둘 중 하나",
        objective: "후보가 **둘** 남았어요. **두 번 안에** 맞히세요.",
        hint: "386이나 863 가운데 하나를 물어요. 틀리면 남은 하나가 정답이에요.",
        scenario: TWO_LEFT,
        check: solveWithin(2),
        success: "맞혔어요! 후보 안에서 물으면 틀려도 다음에 꼭 맞혀요.",
        fail: "후보 밖의 수를 물으면 맞힐 수 없어요. 386과 863만 물어보세요.",
        solution: [guess("386")],
        mistake: [guess("863"), guess("125")],
      },
    ],
  },
  {
    id: "fair",
    title: "비밀 수와 공정한 답",
    summary: "내 수는 내 기기에만, 판 끝에 공개해 답이 정직했는지 확인한다",
    steps: [
      {
        kind: "explain",
        title: "서로 맞히기",
        body: [
          "친구나 컴퓨터와 하는 **서로 맞히기**는 둘 다 비밀 수를 정하고 **번갈아** 물어요.",
          "먼저 묻는 사람(**선**)이 유리하지 않게, 선이 맞히면 **후공에게 한 번 더** 기회를 줘요. 그때 후공도 맞히면 **비겨요**(옵션에서 끌 수 있어요).",
        ],
      },
      {
        kind: "explain",
        title: "방장도 내 수를 몰라요",
        body: [
          "친구와 할 때 대국은 방장 기기가 돌리지만, 내 비밀 수는 **내 기기에만** 있어요. 방장에게는 수를 잠근 **약속**(지문 같은 값)만 가요.",
          "상대가 물으면 **내 기기가** 스트라이크·볼을 세어 답해요. 직접 셀 필요는 없어요.",
          "판이 끝나면 둘 다 비밀 수를 **공개**해요. 공개한 수가 약속과 맞는지, 그동안의 **모든 답**이 그 수로 계산한 답과 같은지 다시 계산해서, 거짓 답이 있으면 그 자리를 짚고 거짓말한 쪽이 져요.",
        ],
      },
      {
        kind: "quiz",
        question: "온라인에서 방장은 내 비밀 수를 언제 알 수 있을까요?",
        options: [
          "판이 끝나 내가 공개할 때",
          "게임을 시작하자마자",
          "내가 답할 때마다",
          "끝까지 모른다",
        ],
        answer: 0,
        explain:
          "판 중에는 잠긴 약속과 내 답만 가요. 비밀 수는 판 끝 **공개** 때 처음 보여요. 그래야 답이 정직했는지 확인할 수 있어요.",
      },
      {
        kind: "quiz",
        question:
          "공정 규칙에서 선이 3번째에 맞혔어요. 후공이 3번째 물음에서 맞히면?",
        options: ["비긴다", "선이 이긴다", "후공이 이긴다", "한 판 더 한다"],
        answer: 0,
        explain:
          "같은 횟수에 둘 다 맞혔으니 **비겨요**. 후공이 못 맞히면 선이 이겨요.",
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "컴퓨터의 비밀 수를 처음부터 맞힌다",
    steps: [
      {
        kind: "explain",
        title: "맞히는 순서",
        body: [
          "처음에는 겹치지 않게 **123, 456**처럼 물어 어떤 숫자가 있는지 알아봐요.",
          "**아웃**이 나온 숫자는 지우고, **볼**은 자리를 바꿔 보고, **스트라이크**는 자리를 지켜요.",
          "후보가 줄면 후보 가운데 하나를 물어요. 보통 **5~6번**이면 맞혀요.",
        ],
      },
      {
        kind: "mission",
        title: "열 번 안에",
        objective: "컴퓨터가 숨긴 세 자리 수를 **열 번 안에** 맞히세요.",
        hint: "아래 후보 수를 보며, 앞 답과 맞는 수만 물어요.",
        scenario: null,
        check: solveWithin(10),
        success: "맞혔어요! 이제 서로 맞히기에서 컴퓨터나 친구와 겨뤄 보세요.",
        fail: "아쉬워요. 아웃·볼·스트라이크를 하나씩 따져 후보를 좁혀 다시 해 봐요.",
      },
    ],
  },
];
