"use client";

import * as React from "react";

type Props = {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "warning" | "danger";
  showLabel?: boolean;
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  variant = "default",
  showLabel = false
}: Props) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`bvProgress bvProgress-${size}`}>
      <div
        className={`bvProgressBar bvProgressBar-${variant}`}
        style={{ width: `${percent}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      />
      {showLabel && (
        <span className="bvProgressLabel">{Math.round(percent)}%</span>
      )}
    </div>
  );
}

