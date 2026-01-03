"use client";

import * as React from "react";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, number> = {
  sm: 28,
  md: 40,
  lg: 56
};

const FONT_SIZES: Record<Size, number> = {
  sm: 11,
  md: 14,
  lg: 20
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 45%)`;
}

type Props = {
  name: string;
  src?: string | null;
  size?: Size;
};

export function Avatar({ name, src, size = "md" }: Props) {
  const px = SIZES[size];
  const fontSize = FONT_SIZES[size];
  const initials = getInitials(name);
  const bgColor = stringToColor(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="bvAvatar"
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className="bvAvatar bvAvatarInitials"
      style={{
        width: px,
        height: px,
        fontSize,
        backgroundColor: bgColor
      }}
      title={name}
    >
      {initials}
    </div>
  );
}

type GroupProps = {
  names: string[];
  max?: number;
  size?: Size;
};

export function AvatarGroup({ names, max = 4, size = "sm" }: GroupProps) {
  const visible = names.slice(0, max);
  const overflow = names.length - max;

  return (
    <div className="bvAvatarGroup">
      {visible.map((name, i) => (
        <Avatar key={i} name={name} size={size} />
      ))}
      {overflow > 0 && (
        <div
          className="bvAvatar bvAvatarOverflow"
          style={{
            width: SIZES[size],
            height: SIZES[size],
            fontSize: FONT_SIZES[size]
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

