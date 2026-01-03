"use client";

import * as React from "react";

type Props = {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
};

export function Tooltip({ content, children, position = "top" }: Props) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      className="bvTooltipWrap"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className={`bvTooltip bvTooltip-${position}`} role="tooltip">
          {content}
        </div>
      )}
    </div>
  );
}

