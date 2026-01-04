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
    console.log("[GlobalKeyboard] Setting up listener");
    
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      console.log("[GlobalKeyboard] keydown:", e.key, "target:", t.tagName);
      
      // Skip if typing
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
        console.log("[GlobalKeyboard] Skipping - in input field");
        return;
      }
      
      // ? = help
      if (e.key === "?") {
        console.log("[GlobalKeyboard] ? pressed - calling onHelp");
        e.preventDefault();
        e.stopPropagation();
        onHelp();
        return;
      }
      
      // Cmd/Ctrl + K = search  
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        console.log("[GlobalKeyboard] Cmd+K pressed - calling onSearch");
        e.preventDefault();
        e.stopPropagation();
        onSearch();
        return;
      }
    }
    
    window.addEventListener("keydown", onKeyDown);
    return () => {
      console.log("[GlobalKeyboard] Removing listener");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onHelp, onSearch]);

  return null;
}
