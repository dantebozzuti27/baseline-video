"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  match: "exact" | "prefix";
};

const TABS: Tab[] = [
  { label: "Templates", href: "/app/programs", match: "exact" },
  { label: "Enrollments", href: "/app/programs/enrollments", match: "prefix" },
  { label: "Feed", href: "/app/programs/feed", match: "prefix" },
  { label: "Library", href: "/app/programs/library", match: "prefix" }
];

function isActive(pathname: string, tab: Tab) {
  if (tab.match === "prefix") return pathname === tab.href || pathname.startsWith(tab.href + "/");
  return pathname === tab.href;
}

export default function ProgramsNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="bvTabs" aria-label="Programs navigation">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={isActive(pathname, tab) ? "bvTab bvTabActive" : "bvTab"}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

