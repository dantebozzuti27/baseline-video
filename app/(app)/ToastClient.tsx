"use client";

import * as React from "react";

function readToast() {
  try {
    return window.sessionStorage.getItem("bv:toast");
  } catch {
    return null;
  }
}

function clearToast() {
  try {
    window.sessionStorage.removeItem("bv:toast");
  } catch {
    // ignore
  }
}

export default function ToastClient() {
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const initial = readToast();
    if (initial) {
      setMsg(initial);
      clearToast();
      const t = window.setTimeout(() => setMsg(null), 2400);
      return () => window.clearTimeout(t);
    }
  }, []);

  React.useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<{ message?: string }>;
      const message = ce?.detail?.message;
      if (!message) return;
      setMsg(message);
      const t = window.setTimeout(() => setMsg(null), 2400);
      return () => window.clearTimeout(t);
    }
    window.addEventListener("bv:toast", onToast as any);
    return () => window.removeEventListener("bv:toast", onToast as any);
  }, []);

  if (!msg) return null;

  return (
    <div className="bvToastWrap" role="status" aria-live="polite">
      <div className="bvToast">{msg}</div>
    </div>
  );
}


