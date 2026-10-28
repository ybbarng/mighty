"use client";

import { BOT_LEVELS } from "@/game/bots";
import { chosenRules, ruleLabel, useSettings } from "@/game/settings";
import { LESSONS } from "@/tutorial/lessons";
import { useTutorialProgress } from "@/tutorial/progress";

import { Logo } from "./brand/Logo";
import { GameHome } from "./GameHome";

/**
 * 마이티 첫 화면. 원작처럼 무엇을 할지만 고른다(나홀로·다함께·배우기).
 * 규칙·카드·컴퓨터 실력은 옵션 화면에 둔다. 모양은 모든 게임이 같이 쓰는 GameHome
 */
export function StartScreen({
  onSolo,
  onTogether,
  onTutorial,
  onOptions,
  onAbout,
  onResume,
}: {
  /** 나홀로 마이티: 컴퓨터와 */
  onSolo: () => void;
  /** 다함께 마이티: 방을 만들어 친구를 부른다 */
  onTogether: () => void;
  onTutorial: () => void;
  onOptions: () => void;
  onAbout: () => void;
  /** 저장한 대국이 있을 때만 */
  onResume?: () => void;
}) {
  const ruleCode = useSettings((s) => s.ruleCode);
  const customRules = useSettings((s) => s.customRules);
  const botLevel = useSettings((s) => s.botLevel);
  const learned = useTutorialProgress((s) => s.completed.length);
  const rules = chosenRules(ruleCode);
  const rule = ruleLabel(ruleCode, customRules);
  const level = BOT_LEVELS.find((l) => l.value === botLevel)?.label;

  return (
    <GameHome
      game="mighty"
      background="bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)]"
      primaryClass="border-amber-300 bg-amber-400 text-black hover:bg-amber-300"
      hero={
        <h1 className="flex justify-center">
          <Logo size={240} animated />
        </h1>
      }
      tagline="공약을 걸고, 프렌드를 찾고, 마이티로 뒤집어라"
      {...(onResume ? { resume: onResume } : {})}
      solo={{
        icon: "♠",
        title: "나홀로 마이티",
        detail: `컴퓨터 ${rules.playerCount - 1}명과 · ${rule} · ${level ?? ""}`,
        onClick: onSolo,
      }}
      together={{
        icon: "👥",
        title: "다함께 마이티",
        detail: "링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다",
        onClick: onTogether,
      }}
      learn={{
        title: "마이티 배우기",
        learned,
        total: LESSONS.length,
        firstHint: "처음이라면 여기부터. 용어부터 한 판까지",
        onClick: onTutorial,
      }}
      onOptions={onOptions}
      aboutLabel="마이티는?"
      onAbout={onAbout}
      credit="마이티 네트워크 4.0을 이어받아 만들었습니다"
    />
  );
}
