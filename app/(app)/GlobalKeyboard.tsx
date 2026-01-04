"use client";

import * as React from "react";

export default function GlobalKeyboard({ 
  onHelp, 
  onSearch 
}: { 
  onHelp: () => void; 
  onSearch: () => void;
}) {
  const onHelpRef = React.useRef(onHelp);
  const onSearchRef = React.useRef(onSearch);
  onHelpRef.current = onHelp;
  onSearchRef.current = onSearch;

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) {
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        onHelpRef.current();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearchRef.current();
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
