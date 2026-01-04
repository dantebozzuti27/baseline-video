"use client";

import * as React from "react";

// Global keyboard state - outside React lifecycle
let keyboardState = {
  helpOpen: false,
  searchOpen: false,
  setHelpOpen: (open: boolean) => {},
  setSearchOpen: (open: boolean) => {}
};

export function useKeyboardHelp() {
  const [open, setOpen] = React.useState(false);
  
  React.useEffect(() => {
    keyboardState.helpOpen = open;
  }, [open]);
  
  React.useEffect(() => {
    keyboardState.setHelpOpen = setOpen;
    return () => { keyboardState.setHelpOpen = () => {}; };
  }, []);
  
  return [open, setOpen] as const;
}

export function useSearchCommand() {
  const [open, setOpen] = React.useState(false);
  
  React.useEffect(() => {
    keyboardState.searchOpen = open;
  }, [open]);
  
  React.useEffect(() => {
    keyboardState.setSearchOpen = setOpen;
    return () => { keyboardState.setSearchOpen = () => {}; };
  }, []);
  
  return [open, setOpen] as const;
}

// Single global handler
export default function GlobalKeyboard() {
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      
      // Skip if in input
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;

      // Cmd+K / Ctrl+K = Open search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        keyboardState.setSearchOpen(true);
        return;
      }

      // ? = Toggle keyboard help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        keyboardState.setHelpOpen(!keyboardState.helpOpen);
        return;
      }

      // Escape = Close modals
      if (e.key === "Escape") {
        if (keyboardState.searchOpen) {
          e.preventDefault();
          e.stopPropagation();
          keyboardState.setSearchOpen(false);
          return;
        }
        if (keyboardState.helpOpen) {
          e.preventDefault();
          e.stopPropagation();
          keyboardState.setHelpOpen(false);
          return;
        }
      }
    }

    // Use capture to get events first
    document.addEventListener("keydown", handleKeyDown, true);
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []); // Empty deps - mount once

  return null;
}

