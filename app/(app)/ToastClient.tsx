"use client";

import * as React from "react";
import { X, CheckCircle } from "lucide-react";

const TOAST_DURATION = 4000;

type ToastItem = {
  id: number;
  message: string;
};

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

let toastId = 0;

export default function ToastClient() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const addToast = React.useCallback((message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-2), { id, message }]); // Keep max 3
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  const dismissToast = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  React.useEffect(() => {
    const initial = readToast();
    if (initial) {
      addToast(initial);
      clearToast();
    }
  }, [addToast]);

  React.useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<{ message?: string }>;
      const message = ce?.detail?.message;
      if (!message) return;
      addToast(message);
    }
    window.addEventListener("bv:toast", onToast as any);
    return () => window.removeEventListener("bv:toast", onToast as any);
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="bvToastContainer" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="bvToast bvSlideUp">
          <CheckCircle size={16} className="bvToastIcon" />
          <span className="bvToastMessage">{toast.message}</span>
          <button
            className="bvToastDismiss"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}



