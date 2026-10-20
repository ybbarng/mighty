import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버 없이 정적 호스팅한다. 온라인 대전이 필요해지면 이 설정을 다시 본다.
  output: "export",
  // 왼쪽 아래 개발 모드 표시가 게임 화면을 가리지 않게 한다.
  devIndicators: false,
  transpilePackages: ["@mighty/engine", "@mighty/ai"],
};

export default nextConfig;
