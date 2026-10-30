import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

/**
 * 빌드한 커밋. 재현 빌드(docs/36 11-8)를 위해 Next가 빌드마다 무작위로 만들던 빌드 id 대신 쓴다.
 * 같은 커밋이면 같은 id라 `out/`이 같아지고, 커밋이 바뀌면 `_next/static/<id>/` 주소도 바뀌어 오래 둔 캐시와 섞이지 않는다.
 * Docker 빌드에는 .git이 없어 `SOURCE_COMMIT`(Image 워크플로가 넣는다)을 먼저 본다.
 */
function sourceCommit(): string {
  const fromEnv = process.env.SOURCE_COMMIT?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // 서버 없이 정적 호스팅한다. 온라인 대전이 필요해지면 이 설정을 다시 본다.
  output: "export",
  // 왼쪽 아래 개발 모드 표시가 게임 화면을 가리지 않게 한다.
  devIndicators: false,
  generateBuildId: async () => sourceCommit(),
  transpilePackages: [
    "@mighty/engine",
    "@mighty/ai",
    "@mighty/fair-play",
    "@mighty/hearts-engine",
    "@mighty/hearts-ai",
  ],
};

export default nextConfig;
