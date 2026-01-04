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

  // Use a stable callback that closes over nothing
  const handleKeyDown = React.useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input
    const target = e.target as HTMLElement;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (target?.isContentEditable) return;

    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(prev => !prev);
    }
  }, []);

  // Escape handler - separate to avoid toggling on Escape
  const handleEscape = React.useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(prev => {
        if (prev) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        return prev;
      });
    }
  }, []);

  React.useEffect(() => {
    // Use capture phase to get events before other handlers
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [handleKeyDown, handleEscape]);

  // Reset focus when closing
  React.useEffect(() => {
    if (!open) {
      // Blur any focused element to ensure keyboard events work
      if (document.activeElement instanceof HTMLElement) {
        const tag = document.activeElement.tagName;
        if (tag !== "BODY" && tag !== "HTML") {
          // Don't blur if it's a normal interactive element
        }
      }
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="bvModalBackdrop bvFadeIn"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="bvModal bvSlideUp" style={{ maxWidth: 400 }}>
        <div className="bvModalHeader">
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <Keyboard size={18} />
            <div className="bvModalTitle">Keyboard shortcuts</div>
          </div>
          <button className="bvModalClose" onClick={() => setOpen(false)} type="button">
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
