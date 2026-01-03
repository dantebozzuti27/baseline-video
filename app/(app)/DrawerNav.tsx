"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";
import {
  Menu,
  ChevronRight,
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Library,
  Upload,
  Columns2,
  Settings,
  Rss,
  BookOpen
} from "lucide-react";

type Role = "coach" | "player";

type Props = {
  role: Role;
  displayName: string;
};

type NavItem = {
  label: string;
  href: string;
  match?: "exact" | "prefix";
  icon: React.ReactNode;
};

function isActive(pathname: string, item: NavItem) {
  if (item.match === "prefix") return pathname === item.href || pathname.startsWith(item.href + "/");
  return pathname === item.href;
}

function focusableEls(root: HTMLElement | null) {
  if (!root) return [];
  const els = Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  );
  return els.filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
}

export default function DrawerNav({ role, displayName }: Props) {
  const pathname = usePathname() ?? "";
  const isCoach = role === "coach";
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  const iconSize = 20;
  const items: NavItem[] = React.useMemo(() => {
    if (isCoach) {
      return [
        { label: "Dashboard", href: "/app/dashboard", match: "prefix", icon: <LayoutDashboard size={iconSize} /> },
        { label: "Lessons", href: "/app/lessons", match: "prefix", icon: <Calendar size={iconSize} /> },
        { label: "Programs", href: "/app/programs", match: "prefix", icon: <FolderKanban size={iconSize} /> },
        { label: "Program library", href: "/app/programs/library", match: "prefix", icon: <BookOpen size={iconSize} /> },
        { label: "Library", href: "/app/library", match: "prefix", icon: <Library size={iconSize} /> },
        { label: "Upload", href: "/app/upload", match: "prefix", icon: <Upload size={iconSize} /> },
        { label: "Compare", href: "/app/compare", match: "prefix", icon: <Columns2 size={iconSize} /> },
        { label: "Settings", href: "/app/settings", match: "prefix", icon: <Settings size={iconSize} /> }
      ];
    }
    return [
      { label: "Feed", href: "/app", match: "exact", icon: <Rss size={iconSize} /> },
      { label: "Lessons", href: "/app/lessons", match: "prefix", icon: <Calendar size={iconSize} /> },
      { label: "Programs", href: "/app/programs/me", match: "prefix", icon: <FolderKanban size={iconSize} /> },
      { label: "Library", href: "/app/library", match: "prefix", icon: <Library size={iconSize} /> },
      { label: "Upload", href: "/app/upload", match: "prefix", icon: <Upload size={iconSize} /> },
      { label: "Settings", href: "/app/settings", match: "prefix", icon: <Settings size={iconSize} /> }
    ];
  }, [isCoach]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const els = focusableEls(panel);
    (els[0] ?? panel)?.focus?.();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [open]);

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    const els = focusableEls(panel);
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];

    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (!active || active === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <>
      <button className="bvHamburger" onClick={() => setOpen(true)} aria-label="Open menu" type="button">
        <Menu size={24} aria-hidden="true" />
      </button>

      {open ? (
        <div className="bvDrawerBackdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="bvDrawer"
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
          >
            <div className="bvDrawerHeader">
              <div>
                <div style={{ fontWeight: 900 }}>{displayName}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {isCoach ? "Coach" : "Player"}
                </div>
              </div>
              <button className="btn" onClick={() => setOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="bvDrawerList" role="navigation" aria-label="Primary">
              {items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    className={active ? "bvNavItem bvNavItemActive" : "bvNavItem"}
                    href={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="bvNavIcon" aria-hidden="true">{item.icon}</span>
                    <span className="bvNavLabel">{item.label}</span>
                    <ChevronRight size={18} className="bvNavChevron" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>

            <div className="bvDrawerFooter">
              <SignOutButton />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}


