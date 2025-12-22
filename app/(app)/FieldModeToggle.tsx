"use client";

import * as React from "react";
import { Button } from "@/components/ui";

export default function FieldModeToggle() {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem("bv:fieldMode");
      const on = v === "1";
      setEnabled(on);
      document.body.classList.toggle("fieldMode", on);
    } catch {
      // ignore
    }
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    document.body.classList.toggle("fieldMode", next);
    try {
      window.localStorage.setItem("bv:fieldMode", next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return <Button onClick={toggle}>{enabled ? "Field mode: ON" : "Field mode"}</Button>;
}
