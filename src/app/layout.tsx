import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "./_components/TopNav";

export const metadata: Metadata = {
  title: "Baseline Video",
  description: "Fresh-start Next.js app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
