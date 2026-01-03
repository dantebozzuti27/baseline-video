"use client";

import * as React from "react";
import { formatRelative } from "@/lib/utils/datetime";

type Props = {
  date: Date | string | number;
  className?: string;
  /** Highlight if within this many minutes */
  recentMinutes?: number;
};

export function TimeAgo({ date, className, recentMinutes = 60 }: Props) {
  const d = React.useMemo(() => new Date(date), [date]);
  const [text, setText] = React.useState(() => formatRelative(d));
  const [isRecent, setIsRecent] = React.useState(false);

  React.useEffect(() => {
    function update() {
      const now = new Date();
      setText(formatRelative(d, now));
      const diffMins = Math.abs(now.getTime() - d.getTime()) / 60000;
      setIsRecent(diffMins <= recentMinutes);
    }

    update();
    // Update every minute
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [d, recentMinutes]);

  const classes = [
    "bvTimeAgo",
    isRecent ? "bvTimeAgoRecent" : "",
    className ?? ""
  ].filter(Boolean).join(" ");

  return (
    <time dateTime={d.toISOString()} className={classes} title={d.toLocaleString()}>
      {text}
    </time>
  );
}

