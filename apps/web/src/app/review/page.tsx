import type { Metadata } from "next";

import { ReviewPage } from "@/review/ReviewPage";

export const metadata: Metadata = {
  title: "복기",
  description: "이 기기에 남긴 지난 게임을 판마다 보고 한 걸음씩 다시 본다",
};

export default function Review() {
  return <ReviewPage />;
}
