import type { Metadata } from "next";

import { BRAND } from "@/components/brand/brand";
import { MightyApp } from "@/components/MightyApp";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} · ${BRAND.englishName}` },
  description: BRAND.description,
};

export default function MightyPage() {
  return <MightyApp />;
}
