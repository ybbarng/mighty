"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

const MARGIN = 2;

/** 초대 링크 QR 코드. 옆에 있는 친구는 휴대폰 카메라로 바로 들어온다 */
export function InviteQr({ url, size = 168 }: { url: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(row, col))
          d += `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`;
    return { path: d, count: n };
  }, [url]);
  const view = count + MARGIN * 2;
  return (
    <svg
      role="img"
      aria-label="초대 링크 QR 코드"
      viewBox={`0 0 ${view} ${view}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-xl"
    >
      <rect width={view} height={view} fill="#ffffff" />
      <path d={path} fill="#111111" />
    </svg>
  );
}
