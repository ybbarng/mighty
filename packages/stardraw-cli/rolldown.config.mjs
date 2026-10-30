// 검사기를 Node가 바로 돌리는 파일 하나로 묶는다(규칙 패키지와 그 의존 패키지까지 모두 넣는다).
// 묶은 파일만 있으면 저장소 없이도 `node stardraw-verify.mjs`로 돈다(npm 발행 준비, docs/36 11-8)
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/cli.ts",
  platform: "node",
  output: {
    file: "dist/stardraw-verify.mjs",
    format: "esm",
    banner: "#!/usr/bin/env node",
  },
  external: [/^node:/],
});
