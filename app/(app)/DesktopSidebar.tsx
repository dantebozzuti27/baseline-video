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
  Settings,
  HelpCircle,
  Columns2,
  BookOpen,
  Shield,
  Users,
  BarChart3,
  type LucideIcon
} from "lucide-react";

type Role = "coach" | "player" | "parent";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: "exact" | "prefix";
  coachOnly?: boolean;
  adminOnly?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  if (item.match === "prefix") return pathname === item.href || pathname.startsWith(item.href + "/");
  return pathname === item.href;
}

type Props = {
  role: Role;
  isAdmin?: boolean;
};

export default function DesktopSidebar({ role, isAdmin }: Props) {
  const pathname = usePathname() ?? "";
  const isCoach = role === "coach";

  const mainItems: NavItem[] = React.useMemo(() => {
    if (role === "coach") {
      return [
        { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, match: "prefix" },
        { label: "Lessons", href: "/app/lessons", icon: Calendar, match: "prefix" },
        { label: "Upload", href: "/app/upload", icon: Upload, match: "prefix" },
        { label: "Programs", href: "/app/programs", icon: FolderKanban, match: "prefix" },
        { label: "Team Mode", href: "/app/team-mode", icon: BarChart3, match: "prefix" },
        { label: "Video Library", href: "/app/library", icon: Library, match: "prefix" },
        { label: "Compare", href: "/app/compare", icon: Columns2, match: "prefix" }
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
      { label: "My Programs", href: "/app/programs/me", icon: FolderKanban, match: "prefix" },
      { label: "Video Library", href: "/app/library", icon: Library, match: "prefix" }
    ];
  }, [role]);

  const secondaryItems: NavItem[] = [
    { label: "Settings", href: "/app/settings", icon: Settings, match: "prefix" },
    { label: "Help", href: "/app/help", icon: HelpCircle, match: "prefix" }
  ];

  if (isCoach) {
    secondaryItems.unshift({ label: "Program Library", href: "/app/programs/library", icon: BookOpen, match: "prefix" });
  }

  if (isAdmin) {
    secondaryItems.push({ label: "Admin", href: "/app/admin", icon: Shield, match: "prefix" });
  }

  return (
    <aside className="bvDesktopSidebar">
      <div className="bvSidebarLogo">
        <Link href="/app" aria-label="Baseline Video home">
          <img src="/brand copy-Photoroom.png" alt="Baseline Video" />
        </Link>
      </div>

      <nav className="bvSidebarNav">
        <div className="bvSidebarSection">
          {mainItems.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "bvSidebarItem bvSidebarItemActive" : "bvSidebarItem"}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="bvSidebarDivider" />

        <div className="bvSidebarSection">
          {secondaryItems.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "bvSidebarItem bvSidebarItemActive" : "bvSidebarItem"}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

