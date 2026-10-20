"use client";

import type { RuleSet } from "@mighty/engine";
import { useEffect, useState } from "react";

import type { SavedMatch } from "@/game/local-match";
import { clearGame, loadGame } from "@/game/persistence";
import { chosenRules, useSettings } from "@/game/settings";
import { useGame } from "@/game/store";
import { endOnlineSession } from "@/net/session";

import { AboutScreen } from "./AboutScreen";
import { GameTable } from "./GameTable";
import { OnlineScreen } from "./OnlineScreen";
import { OptionsScreen } from "./OptionsScreen";
import { Splash } from "./Splash";
import { StartScreen } from "./StartScreen";
import { LessonPlayer } from "./tutorial/LessonPlayer";
import { TutorialHome } from "./tutorial/TutorialHome";

type Screen =
  | { kind: "start" }
  | { kind: "online"; rules: RuleSet; room: string | null }
  | { kind: "playing" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string }
  | { kind: "options" }
  | { kind: "about" };

export function MightyApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const [saved, setSaved] = useState<SavedMatch | null>(null);
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);

  // 저장소와 주소는 브라우저에만 있으므로 그린 뒤에 읽는다.
  useEffect(() => {
    if (screen.kind === "start") setSaved(loadGame());
  }, [screen.kind]);

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room)
      setScreen({
        kind: "online",
        rules: chosenRules(useSettings.getState().ruleCode),
        room,
      });
  }, []);

  const backToStart = () => {
    endOnlineSession();
    useGame.setState({
      seatNames: null,
      audit: null,
      hostLeft: false,
      reconnecting: false,
      offlineSeats: [],
    });
    // 초대 링크로 들어왔다면 주소의 방 코드를 지워 처음 화면으로 돌아간다.
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online") {
    return (
      <OnlineScreen
        rules={screen.rules}
        roomFromUrl={screen.room}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  }

  if (screen.kind === "tutorial") {
    return (
      <TutorialHome
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  }

  if (screen.kind === "lesson") {
    return (
      <LessonPlayer
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
