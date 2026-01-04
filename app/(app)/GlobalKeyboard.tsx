"use client";

import * as React from "react";

// Simple global keyboard shortcuts
export default function GlobalKeyboard({ 
  onHelp, 
  onSearch 
}: { 
  onHelp: () => void; 
  onSearch: () => void;
}) {
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip if typing
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      
      // ? = help
      if (e.key === "?") {
        e.preventDefault();
        onHelp();
      }
      // Cmd/Ctrl + K = search  
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSearch();
      }
    }
    
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onHelp, onSearch]);

  return null;
}
