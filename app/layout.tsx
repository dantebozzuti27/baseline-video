import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Baseline Video",
  description: "Simple video management for baseball coaches and players."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


