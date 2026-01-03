"use client";

import * as React from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Open search" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Close dialog / Go back" },
  { keys: ["Space"], description: "Play / Pause video" },
  { keys: ["←", "→"], description: "Frame step (on video page)" },
  { keys: ["↑", "↓"], description: "Speed up / slow down video" }
];

export default function KeyboardHelp() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore if typing in input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="bvModalBackdrop bvFadeIn"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="bvModal bvSlideUp" style={{ maxWidth: 400 }}>
        <div className="bvModalHeader">
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <Keyboard size={18} />
            <div className="bvModalTitle">Keyboard shortcuts</div>
          </div>
          <button className="bvModalClose" onClick={() => setOpen(false)}>
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
        <div className="bvModalFooter">
          <div className="muted" style={{ fontSize: 12 }}>
            Press <span className="bvKbd">?</span> to toggle this help
          </div>
        </div>
      </div>
    </div>
  );
}

