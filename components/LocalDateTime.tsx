"use client";

import * as React from "react";

function formatUtcFallback(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export function LocalDateTime({ value }: { value: string }) {
  const [text, setText] = React.useState<string>(() => formatUtcFallback(value));

  React.useEffect(() => {
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return;
      setText(
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(d)
      );
    } catch {
      // ignore
    }
  }, [value]);

  return (
    <time dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  );
}
