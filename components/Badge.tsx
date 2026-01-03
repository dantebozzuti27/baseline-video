"use client";

import * as React from "react";

type Props = {
  count: number;
  max?: number;
  variant?: "default" | "danger" | "success";
  children?: React.ReactNode;
};

export function Badge({ count, max = 99, variant = "default", children }: Props) {
  if (count === 0 && !children) return null;

  const display = count > max ? `${max}+` : String(count);
  const cls = `bvBadge bvBadge-${variant}`;

  if (children) {
    return (
      <div className="bvBadgeWrap">
        {children}
        {count > 0 && <span className={cls}>{display}</span>}
      </div>
    );
  }

  return <span className={cls}>{display}</span>;
}

export function Dot({ variant = "default" }: { variant?: "default" | "danger" | "success" | "warning" }) {
  return <span className={`bvDot bvDot-${variant}`} />;
}

