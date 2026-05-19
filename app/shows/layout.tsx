import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shows | StageFlow",
};

export default function ShowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
