"use client";

import Link from "next/link";
import { Button, LinkButton } from "./ui";
import {
  Video,
  Calendar,
  FolderKanban,
  Library,
  Upload,
  Users,
  type LucideIcon
} from "lucide-react";

type Variant = "videos" | "lessons" | "programs" | "library" | "roster" | "generic";

const ICONS: Record<Variant, LucideIcon> = {
  videos: Video,
  lessons: Calendar,
  programs: FolderKanban,
  library: Library,
  roster: Users,
  generic: Upload
};

const DEFAULTS: Record<Variant, { title: string; message: string }> = {
  videos: {
    title: "No videos yet",
    message: "Upload your first swing video to get started with analysis."
  },
  lessons: {
    title: "No lessons scheduled",
    message: "Request a lesson or block off your calendar."
  },
  programs: {
    title: "No programs yet",
    message: "Create a training program to share with your players."
  },
  library: {
    title: "Library is empty",
    message: "Videos you save to your library will appear here."
  },
  roster: {
    title: "No players yet",
    message: "Share your invite link to bring players onto your team."
  },
  generic: {
    title: "Nothing here",
    message: "There's nothing to display yet."
  }
};

type Props = {
  variant?: Variant;
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
};

export function EmptyState({
  variant = "generic",
  title,
  message,
  actionLabel,
  actionHref,
  onAction
}: Props) {
  const Icon = ICONS[variant];
  const defaults = DEFAULTS[variant];

  return (
    <div className="bvEmptyState">
      <div className="bvEmptyIcon">
        <Icon size={48} strokeWidth={1.5} />
      </div>
      <div className="bvEmptyTitle">{title ?? defaults.title}</div>
      <div className="bvEmptyMessage">{message ?? defaults.message}</div>
      {actionLabel && actionHref ? (
        <LinkButton href={actionHref} variant="primary">
          {actionLabel}
        </LinkButton>
      ) : actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

