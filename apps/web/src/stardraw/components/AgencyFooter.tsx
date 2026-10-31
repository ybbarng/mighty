import { MadeWith } from "@/components/brand/MadeWith";

/** 별 따기 모든 페이지의 맨 아래: 운영 기관(카노푸스 우주국)과 만든 사람 */
export function AgencyFooter() {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        data-agency-footer
        className="font-semibold text-white/55 text-xs tracking-[0.2em]"
      >
        카노푸스 우주국
      </span>
      <span>
        <MadeWith />
      </span>
    </span>
  );
}
