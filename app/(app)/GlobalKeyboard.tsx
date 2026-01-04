"use client";

import * as React from "react";

// Singleton pattern - only one instance ever
let initialized = false;
let helpOpen = false;
let searchOpen = false;
let setHelpOpenFn: React.Dispatch<React.SetStateAction<boolean>> | null = null;
let setSearchOpenFn: React.Dispatch<React.SetStateAction<boolean>> | null = null;

function handleKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const tag = target?.tagName?.toUpperCase();
  
  // Debug log
  if (process.env.NODE_ENV === "development") {
    console.log("[GlobalKeyboard]", e.key, { tag, helpOpen, searchOpen, hasFn: !!setHelpOpenFn });
  }
  
  // Skip if typing in form fields
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (target?.isContentEditable) return;

  // Cmd+K / Ctrl+K = Open search
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    e.stopPropagation();
    searchOpen = true;
    setSearchOpenFn?.(true);
    return;
  }

  // ? = Toggle keyboard help (Shift+/ on US keyboards)
  if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    helpOpen = !helpOpen;
    setHelpOpenFn?.(helpOpen);
    console.log("[GlobalKeyboard] Toggled help:", helpOpen);
    return;
  }

  // Escape = Close modals
  if (e.key === "Escape") {
    if (searchOpen) {
      e.preventDefault();
      e.stopPropagation();
      searchOpen = false;
      setSearchOpenFn?.(false);
      return;
    }
    if (helpOpen) {
      e.preventDefault();
      e.stopPropagation();
      helpOpen = false;
      setHelpOpenFn?.(false);
      return;
    }
  }
}

export function useKeyboardHelp() {
  const [open, setOpen] = React.useState(helpOpen);
  
  React.useLayoutEffect(() => {
    setHelpOpenFn = setOpen;
    // Sync initial state
    if (open !== helpOpen) {
      setOpen(helpOpen);
    }
  }, [open]);
  
  // Sync back to global when React state changes (e.g., from UI close button)
  const setOpenWrapper = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const newValue = typeof value === "function" ? value(helpOpen) : value;
    helpOpen = newValue;
    setOpen(newValue);
  }, []);
  
  return [open, setOpenWrapper] as const;
}

export function useSearchCommand() {
  const [open, setOpen] = React.useState(searchOpen);
  
  React.useLayoutEffect(() => {
    setSearchOpenFn = setOpen;
    // Sync initial state
    if (open !== searchOpen) {
      setOpen(searchOpen);
    }
  }, [open]);
  
  // Sync back to global when React state changes
  const setOpenWrapper = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const newValue = typeof value === "function" ? value(searchOpen) : value;
    searchOpen = newValue;
    setOpen(newValue);
  }, []);
  
  return [open, setOpenWrapper] as const;
}

export default function GlobalKeyboard() {
  React.useEffect(() => {
    if (initialized) return;
    initialized = true;
    
    document.addEventListener("keydown", handleKeyDown, true);
    
    // Never remove - singleton pattern
  }, []);

  return null;
}
