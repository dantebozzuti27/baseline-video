"use client";

import * as React from "react";

type Props = {
  label?: string;
  spacing?: "sm" | "md" | "lg";
};

export function Divider({ label, spacing = "md" }: Props) {
  if (label) {
    return (
      <div className={`bvDivider bvDivider-${spacing}`}>
        <span>{label}</span>
      </div>
    );
  }

  return <hr className={`bvDividerLine bvDivider-${spacing}`} />;
}

