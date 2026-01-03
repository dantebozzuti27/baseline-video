"use client";

import * as React from "react";

type Props = {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
  className?: string;
};

const ROUNDED: Record<string, string> = {
  sm: "4px",
  md: "8px",
  lg: "12px",
  full: "9999px"
};

export function Skeleton({ width, height, rounded = "md", className }: Props) {
  return (
    <div
      className={`bvSkeleton ${className ?? ""}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: ROUNDED[rounded]
      }}
    />
  );
}

export function SkeletonText({ lines = 3, width }: { lines?: number; width?: string }) {
  return (
    <div className="bvSkeletonText">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? "60%" : width ?? "100%"}
          rounded="sm"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bvSkeletonCard">
      <Skeleton height={20} width="40%" rounded="sm" />
      <SkeletonText lines={2} />
    </div>
  );
}

