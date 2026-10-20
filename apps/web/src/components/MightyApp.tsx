"use client";

import { presetRules, type RuleSet } from "@mighty/engine";
import { useEffect, useState } from "react";

import type { SavedMatch } from "@/game/local-match";
import { clearGame, loadGame } from "@/game/persistence";
import { useGame } from "@/game/store";
import { endOnlineSession } from "@/net/session";

import { GameTable } from "./GameTable";
import { OnlineScreen } from "./OnlineScreen";
import { Splash } from "./Splash";
import { StartScreen } from "./StartScreen";
import { LessonPlayer } from "./tutorial/LessonPlayer";
import { TutorialHome } from "./tutorial/TutorialHome";

type Screen =
  | { kind: "start" }
  | { kind: "online"; rules: RuleSet; room: string | null }
  | { kind: "playing" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string };

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
      setScreen({ kind: "online", rules: presetRules("standard5"), room });
  }, []);

  const backToStart = () => {
    endOnlineSession();
    useGame.setState({ seatNames: null, audit: null, hostLeft: false });
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

  if (screen.kind === "start") {
    return (
      <>
        <Splash />
        <StartScreen
          onStart={(rules) => {
            // 주소에 ?seed=숫자 가 있으면 같은 패로 시작한다(버그 재현용).
            const seed = Number(
              new URLSearchParams(window.location.search).get("seed"),
            );
            newGame({
              rules,
              ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
            });
            setScreen({ kind: "playing" });
          }}
          onOnline={(rules) => setScreen({ kind: "online", rules, room: null })}
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
