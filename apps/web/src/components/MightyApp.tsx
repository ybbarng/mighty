"use client";

import { useEffect, useState } from "react";

import type { SavedMatch } from "@/game/local-match";
import { clearGame, loadGame } from "@/game/persistence";
import { useGame } from "@/game/store";

import { GameTable } from "./GameTable";
import { Splash } from "./Splash";
import { StartScreen } from "./StartScreen";

export function MightyApp() {
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState<SavedMatch | null>(null);
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);

  // 저장소는 브라우저에만 있으므로 그린 뒤에 읽는다.
  useEffect(() => {
    if (!playing) setSaved(loadGame());
  }, [playing]);

  if (!playing) {
    return (
      <>
        <Splash />
        <StartScreen
          onStart={(rules) => {
            newGame({ rules });
            setPlaying(true);
          }}
          {...(saved
            ? {
                onResume: () => {
                  try {
                    resume(saved);
                    setPlaying(true);
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
  return <GameTable onExit={() => setPlaying(false)} />;
}
