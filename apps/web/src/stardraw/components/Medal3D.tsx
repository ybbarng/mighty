"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import type { MedalKind, MedalScene } from "../medal/medal-scene";

/** 리본까지 넣은 훈장의 세로:가로 */
export const MEDAL_ASPECT = 1.45;

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * 3D 훈장(medal-scene.ts를 처음 그릴 때 불러온다). 끌거나 마우스를 올리면 기울고, 폰이 기울기를 알려 주면 그것도
 * 따른다. 화면 밖이면 멈춘다. WebGL이 없으면 `fallback`(평면 훈장)을 그린다. 움직임 줄이기면 한 장만 그린다
 */
export function Medal3D({
  kind,
  width,
  still,
  fallback,
}: {
  kind: MedalKind;
  width: number;
  still: boolean;
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MedalScene | null>(null);
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * MEDAL_ASPECT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      setFailed(true);
      return;
    }
    let disposed = false;
    let io: IntersectionObserver | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      // 폰을 보통 쥐는 각도(약 45°)를 가운데로
      sceneRef.current?.setTilt((e.beta - 45) / 35, e.gamma / 35);
    };
    void import("../medal/medal-scene")
      .then(({ createMedalScene }) => {
        if (disposed) return;
        const scene = createMedalScene(canvas, { kind, still });
        sceneRef.current = scene;
        scene.resize(canvas.clientWidth, canvas.clientHeight);
        io = new IntersectionObserver(([entry]) =>
          scene.setActive(!!entry?.isIntersecting && !document.hidden),
        );
        io.observe(canvas);
        if (!still) window.addEventListener("deviceorientation", onOrient);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      io?.disconnect();
      window.removeEventListener("deviceorientation", onOrient);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [kind, still]);

  useEffect(() => {
    sceneRef.current?.resize(width, height);
  }, [width, height]);

  if (failed) return <>{fallback}</>;
  return (
    <canvas
      ref={canvasRef}
      data-medal-3d={kind}
      onPointerMove={(e) => {
        if (still) return;
        const r = e.currentTarget.getBoundingClientRect();
        sceneRef.current?.setTilt(
          ((e.clientY - r.top) / r.height - 0.55) * 1.6,
          ((e.clientX - r.left) / r.width - 0.5) * 2,
        );
      }}
      onPointerLeave={() => sceneRef.current?.setTilt(0, 0)}
      style={{ width, height, touchAction: "pan-y" }}
    />
  );
}
