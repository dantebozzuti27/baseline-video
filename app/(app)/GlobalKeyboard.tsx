"use client";

import * as React from "react";

export default function GlobalKeyboard({ 
  onHelp, 
  onSearch 
}: { 
  onHelp: () => void; 
  onSearch: () => void;
}) {
  // Store callbacks in refs - they'll always be current
  const onHelpRef = React.useRef(onHelp);
  const onSearchRef = React.useRef(onSearch);
  
  // Keep refs updated
  onHelpRef.current = onHelp;
  onSearchRef.current = onSearch;

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      
      // Skip if in any form field
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) {
        return;
      }
      
      // ? = help
      if (e.key === "?") {
        e.preventDefault();
        onHelpRef.current();
        return;
      }
      
      // Cmd/Ctrl + K = search  
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearchRef.current();
        return;
      }
    }
    
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []); // Empty deps - listener attached ONCE, never removed until unmount

  return null;
}
