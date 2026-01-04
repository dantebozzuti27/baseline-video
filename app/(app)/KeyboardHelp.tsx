"use client";

import * as React from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Open search" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Close dialog" },
];

export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bvModalBackdrop bvFadeIn" onClick={onClose}>
      <div className="bvModal bvSlideUp" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="bvModalHeader">
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <Keyboard size={18} />
            <div className="bvModalTitle">Keyboard shortcuts</div>
          </div>
          <button className="bvModalClose" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="bvModalBody">
          <div className="stack" style={{ gap: 12 }}>
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="muted" style={{ fontSize: 14 }}>{s.description}</div>
                <div className="row" style={{ gap: 4 }}>
                  {s.keys.map((k, j) => (
                    <span key={j} className="bvKbd">{k}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
