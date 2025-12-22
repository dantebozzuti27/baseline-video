"use client";

import * as React from "react";

export default function FeedClient() {
  React.useEffect(() => {
    // Best-effort: mark feed as seen to power "new since last visit" badges.
    fetch("/api/feed/touch", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
