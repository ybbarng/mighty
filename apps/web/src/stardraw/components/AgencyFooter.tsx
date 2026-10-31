import { MadeWith } from "@/components/brand/MadeWith";

/** 별 따기 모든 페이지의 맨 아래: 운영 기관(카노푸스 우주국, 누르면 소개 페이지)과 만든 사람 */
export function AgencyFooter() {
  return (
    <span className="flex flex-col items-center gap-1">
      <a
        href="/stardraw/bureau"
        data-agency-footer
        className="font-semibold text-white/55 text-xs tracking-[0.2em] underline-offset-4 hover:text-white/80 hover:underline"
      >
        카노푸스 우주국
      </a>
      <span>
        <MadeWith />
      </span>
    </span>
  );
}
