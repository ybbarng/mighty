"use client";

import { useState } from "react";

import { useGame } from "@/game/store";

import { GameTable } from "./GameTable";
import { StartScreen } from "./StartScreen";

export function MightyApp() {
  const [playing, setPlaying] = useState(false);
  const newGame = useGame((s) => s.newGame);

  if (!playing) {
    return (
      <StartScreen
        onStart={(rules) => {
          newGame({ rules });
          setPlaying(true);
        }}
      />
    );
  }
  return <GameTable onExit={() => setPlaying(false)} />;
}
