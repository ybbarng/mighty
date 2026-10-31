// 로컬 데모 전용 쪽(/stardraw/room, 회차 방 바로가기)을 운영 빌드의 out/ 에서 뺀다.
// 정적 내보내기는 notFound()인 쪽도 "찾을 수 없음" 내용으로 room.html을 만들어, nginx가 그 파일을 200으로 낸다.
// 파일을 지워야 운영 주소가 진짜 404(error_page)가 된다. 해시 목록(build-hashes.mjs)보다 먼저 돈다.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));

if (process.env.NEXT_PUBLIC_STARDRAW_ROOM_SHORTCUT !== "1")
  for (const path of [
    "stardraw/room",
    "stardraw/room.html",
    "stardraw/room.txt",
  ])
    rmSync(join(out, path), { recursive: true, force: true });
