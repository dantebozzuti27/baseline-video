"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/app/(app)/SignOutButton";
import {
  X,
  Settings,
  HelpCircle,
  User,
  Columns2,
  Library,
  BookOpen,
  Shield
} from "lucide-react";

type Role = "coach" | "player" | "parent";

type Props = {
  open: boolean;
  onClose: () => void;
  role: Role;
  displayName: string;
  isAdmin?: boolean;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  coachOnly?: boolean;
  adminOnly?: boolean;
};

export default function MoreSheet({ open, onClose, role, displayName, isAdmin }: Props) {
  const pathname = usePathname() ?? "";
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const isCoach = role === "coach";

  const items: NavItem[] = [
    { label: "Settings", href: "/app/settings", icon: <Settings size={20} /> },
    { label: "Compare Videos", href: "/app/compare", icon: <Columns2 size={20} />, coachOnly: true },
    { label: "Program Library", href: "/app/programs/library", icon: <BookOpen size={20} />, coachOnly: true },
    { label: "Video Library", href: "/app/library", icon: <Library size={20} /> },
    { label: "Help", href: "/app/help", icon: <HelpCircle size={20} /> },
    { label: "Admin", href: "/app/admin", icon: <Shield size={20} />, adminOnly: true }
  ];

  const visibleItems = items.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.coachOnly && !isCoach) return false;
    return true;
  });

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll when open
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="bvSheetBackdrop" onClick={onClose}>
      <div
        className="bvSheet"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="More options"
      >
        <div className="bvSheetHeader">
          <div className="bvSheetUser">
            <div className="bvSheetAvatar">
              <User size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>{displayName}</div>
              <div className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>
                {role}
              </div>
            </div>
          </div>
          <button className="bvSheetClose" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="bvSheetList">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? "bvSheetItem bvSheetItemActive" : "bvSheetItem"}
                onClick={onClose}
              >
                <span className="bvSheetItemIcon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="bvSheetFooter">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

