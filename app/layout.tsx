import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const themeInitScript = `
  try {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  } catch (error) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
`;

export const metadata: Metadata = {
  title: "StageFlow",
  description: "StageFlow by Pinnacle Recording Studio for managing shows, guests, band details, and setlists.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <Script
          id="stageflow-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-[#050505] text-slate-100">{children}</body>
    </html>
  );
}
