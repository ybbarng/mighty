"use client";

import type { RuleSet } from "@mighty/engine";
import { useEffect, useState } from "react";
import type { SavedMatch } from "@/game/local-match";
import { clearGame, loadGame } from "@/game/persistence";
import { useScreenHistory } from "@/game/screen-history";
import { chosenRules, useSettings } from "@/game/settings";
import { useGame } from "@/game/store";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { endOnlineSession } from "@/net/session";

import { AboutScreen } from "./AboutScreen";
import { GameTable } from "./GameTable";
import { OnlineScreen } from "./OnlineScreen";
import { OptionsScreen } from "./OptionsScreen";
import { Splash } from "./Splash";
import { StartScreen } from "./StartScreen";
import { LessonPlayer } from "./tutorial/LessonPlayer";
import { mightyTutorial } from "./tutorial/mighty-tutorial";
import { TutorialHome } from "./tutorial/TutorialHome";

type Screen =
  | { kind: "start" }
  | {
      kind: "online";
      rules: RuleSet;
      room: string | null;
      resume?: { room: string; restore: HostRestore };
    }
  | { kind: "playing" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string }
  | { kind: "options" }
  | { kind: "about" };

export function MightyApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endOnlineSession();
    useGame.setState({
      seatNames: null,
      audit: null,
      hostLeft: false,
      reconnecting: false,
      offlineSeats: [],
      endVote: null,
    });
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "about", "tutorial"] },
  );
  const [saved, setSaved] = useState<SavedMatch | null>(null);
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);

  // 저장소와 주소는 브라우저에만 있으므로 그린 뒤에 읽는다.
  useEffect(() => {
    if (screen.kind === "start") setSaved(loadGame());
  }, [screen.kind]);

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({
        kind: "online",
        rules: chosenRules(useSettings.getState().ruleCode),
        room,
      });
      return;
    }
    // 이 탭에서 연 방이 있으면(방장이 새로고침) 그 방을 이어 간다.
    const hosted = hostedRoom("mighty");
    if (hosted)
      setScreen({
        kind: "online",
        rules: chosenRules(useSettings.getState().ruleCode),
        room: null,
        resume: hosted,
      });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  if (screen.kind === "online") {
    return (
      <OnlineScreen
        rules={screen.rules}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  }

  if (screen.kind === "tutorial") {
    return (
      <TutorialHome
        tutorial={mightyTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  }

  if (screen.kind === "lesson") {
    return (
      <LessonPlayer
        tutorial={mightyTutorial}
        key={screen.lessonId}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  }

  if (screen.kind === "options") return <OptionsScreen onBack={backToStart} />;

  if (screen.kind === "about") {
    return (
      <AboutScreen
        onBack={backToStart}
        onTutorial={() => setScreen({ kind: "tutorial" })}
      />
    );
  }

  if (screen.kind === "start") {
    const rules = () => chosenRules(useSettings.getState().ruleCode);
    return (
      <>
        <Splash />
        <StartScreen
          onSolo={() => {
            // 주소에 ?seed=숫자 가 있으면 같은 패로 시작한다(버그 재현용).
            const seed = Number(
              new URLSearchParams(window.location.search).get("seed"),
            );
            newGame({
              rules: rules(),
              ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
            });
            setScreen({ kind: "playing" });
          }}
          onTogether={() =>
            setScreen({ kind: "online", rules: rules(), room: null })
          }
          onOptions={() => setScreen({ kind: "options" })}
          onAbout={() => setScreen({ kind: "about" })}
          onTutorial={() => setScreen({ kind: "tutorial" })}
          {...(saved
            ? {
                onResume: () => {
                  try {
                    resume(saved);
                    setScreen({ kind: "playing" });
                  } catch {
                    // 규칙이 바뀌어 되살릴 수 없는 저장은 버린다.
                    clearGame();
                    setSaved(null);
                  }
                },
              }
            : {})}
        />
      </>
    );
  }
  return <GameTable onExit={backToStart} />;
}
