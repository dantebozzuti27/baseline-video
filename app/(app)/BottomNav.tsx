"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Upload,
  Library,
  Rss,
  FolderKanban,
  type LucideIcon
} from "lucide-react";

type Role = "coach" | "player";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: "exact" | "prefix";
};

function isActive(pathname: string, item: NavItem) {
  if (item.match === "prefix") return pathname === item.href || pathname.startsWith(item.href + "/");
  return pathname === item.href;
}

export default function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname() ?? "";
  const isCoach = role === "coach";

  const items: NavItem[] = React.useMemo(() => {
    if (isCoach) {
      return [
        { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, match: "prefix" },
        { label: "Lessons", href: "/app/lessons", icon: Calendar, match: "prefix" },
        { label: "Upload", href: "/app/upload", icon: Upload, match: "prefix" },
        { label: "Programs", href: "/app/programs", icon: FolderKanban, match: "prefix" },
        { label: "Library", href: "/app/library", icon: Library, match: "prefix" }
      ];
    }
    return [
      { label: "Feed", href: "/app", icon: Rss, match: "exact" },
      { label: "Lessons", href: "/app/lessons", icon: Calendar, match: "prefix" },
      { label: "Upload", href: "/app/upload", icon: Upload, match: "prefix" },
      { label: "Programs", href: "/app/programs/me", icon: FolderKanban, match: "prefix" },
      { label: "Library", href: "/app/library", icon: Library, match: "prefix" }
    ];
  }, [isCoach]);

  return (
    <nav className="bvBottomNav" aria-label="Primary">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "bvBottomNavItem bvBottomNavItemActive" : "bvBottomNavItem"}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span className="bvBottomNavLabel">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

