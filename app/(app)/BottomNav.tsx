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
  MoreHorizontal,
  Users,
  type LucideIcon
} from "lucide-react";

type Role = "coach" | "player" | "parent";

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

type Props = {
  role: Role;
  onMoreClick: () => void;
};

export default function BottomNav({ role, onMoreClick }: Props) {
  const pathname = usePathname() ?? "";

  const items: NavItem[] = React.useMemo(() => {
    if (role === "coach") {
      return [
        { label: "Home", href: "/app/dashboard", icon: LayoutDashboard, match: "prefix" },
        { label: "Lessons", href: "/app/lessons", icon: Calendar, match: "prefix" },
        { label: "Upload", href: "/app/upload", icon: Upload, match: "prefix" },
        { label: "Programs", href: "/app/programs", icon: FolderKanban, match: "prefix" }
      ];
    }
    if (role === "parent") {
      return [
        { label: "Home", href: "/app/parent", icon: LayoutDashboard, match: "prefix" },
        { label: "Schedule", href: "/app/lessons", icon: Calendar, match: "prefix" },
        { label: "Videos", href: "/app/library", icon: Library, match: "prefix" },
        { label: "Children", href: "/app/parent/children", icon: Users, match: "prefix" }
      ];
    }
    // Player
    return [
      { label: "Feed", href: "/app", icon: Rss, match: "exact" },
      { label: "Lessons", href: "/app/lessons", icon: Calendar, match: "prefix" },
      { label: "Upload", href: "/app/upload", icon: Upload, match: "prefix" },
      { label: "Programs", href: "/app/programs/me", icon: FolderKanban, match: "prefix" }
    ];
  }, [role]);

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
      <button
        className="bvBottomNavItem"
        onClick={onMoreClick}
        type="button"
        aria-label="More options"
      >
        <MoreHorizontal size={22} strokeWidth={2} />
        <span className="bvBottomNavLabel">More</span>
      </button>
    </nav>
  );
}
