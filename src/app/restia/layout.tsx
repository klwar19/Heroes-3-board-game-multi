import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Otherworld Life — Restia",
  robots: { index: false, follow: false }
};

export default function RestiaLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
