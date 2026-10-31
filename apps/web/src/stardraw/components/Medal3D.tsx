"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { HDR_GLOW_SRC, useHdrScreen } from "../hdr-glow";
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

/** 정지 그림 모음(같은 종류·크기는 한 번만 그린다) */
const snapshots = new Map<string, string>();

/**
 * 3D 훈장(medal-scene.ts를 처음 그릴 때 불러온다). 끌거나 마우스를 올리면 기울고, 폰이 기울기를 알려 주면 그것도
 * 따른다. 화면 밖이면 멈춘다. WebGL이 없으면 `fallback`(평면 훈장)을 그린다. 움직임 줄이기면 한 장만 그린다.
 * `snapshot`이면 같은 장면을 한 번 그려 그림으로 바꾸고 WebGL을 바로 놓는다(목록의 작은 훈장: 화면이 여럿이어도
 * WebGL은 늘지 않는다). HDR 화면이면 가장 밝은 반짝임 자리에 흰색보다 밝은 그림(hdr-glow)을 겹친다
 */
export function Medal3D({
  kind,
  width,
  still,
  snapshot = false,
  fallback,
}: {
  kind: MedalKind;
  width: number;
  still: boolean;
  snapshot?: boolean;
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLImageElement>(null);
  const sceneRef = useRef<MedalScene | null>(null);
  const [failed, setFailed] = useState(false);
  const key = `${kind}:${width}`;
  const [image, setImage] = useState<string | null>(() =>
    snapshot ? (snapshots.get(key) ?? null) : null,
  );
  const hdr = useHdrScreen();
  const height = Math.round(width * MEDAL_ASPECT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || image) return;
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
    const onGlint = (x: number, y: number, strength: number) => {
      const img = glowRef.current;
      if (!img) return;
      img.style.left = `${x * 100}%`;
      img.style.top = `${y * 100}%`;
      img.style.opacity = String(strength);
    };
    void import("../medal/medal-scene")
      .then(({ createMedalScene }) => {
        if (disposed) return;
        const scene = createMedalScene(canvas, {
          kind,
          still: still || snapshot,
          ...(hdr && !snapshot ? { onGlint } : {}),
        });
        sceneRef.current = scene;
        scene.resize(canvas.clientWidth, canvas.clientHeight);
        if (snapshot) {
          // 살짝 기울인 한 장을 그림으로 남기고 WebGL을 놓는다
          scene.setTilt(-0.2, 0.35);
          const url = canvas.toDataURL("image/png");
          snapshots.set(key, url);
          scene.dispose();
          sceneRef.current = null;
          setImage(url);
          return;
        }
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
  }, [kind, still, snapshot, hdr, key, image]);

  useEffect(() => {
    sceneRef.current?.resize(width, height);
  }, [width, height]);

  if (failed) return <>{fallback}</>;
  if (image)
    return (
      // biome-ignore lint/performance/noImgElement: 정적 내보내기라 그린 그림을 그대로 쓴다
      <img
        src={image}
        alt=""
        data-medal-still={kind}
        width={width}
        height={height}
        style={{ width, height }}
      />
    );
  return (
    <span className="relative inline-block" style={{ width, height }}>
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
      {hdr && !snapshot && (
        // biome-ignore lint/performance/noImgElement: 정적 내보내기라 HDR AVIF를 그대로 겹친다
        <img
          ref={glowRef}
          src={HDR_GLOW_SRC}
          alt=""
          aria-hidden="true"
          className="sd-hdr pointer-events-none absolute"
          style={{
            width: width * 0.22,
            height: width * 0.22,
            transform: "translate(-50%, -50%)",
            opacity: 0,
          }}
        />
      )}
    </span>
  );
}
