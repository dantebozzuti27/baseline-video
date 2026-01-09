"use client";

import * as React from "react";
import Link from "next/link";
import BottomNav from "./BottomNav";
import DesktopSidebar from "./DesktopSidebar";
import UploadFAB from "./UploadFAB";
import SearchCommand from "./SearchCommand";
import KeyboardHelp from "./KeyboardHelp";
import GlobalKeyboard from "./GlobalKeyboard";
import ToastClient from "./ToastClient";
import MoreSheet from "@/components/MoreSheet";
import NotificationBell from "@/components/NotificationBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";

type Props = {
  role: "coach" | "player" | "parent";
  displayName: string;
  isAdmin?: boolean;
  children: React.ReactNode;
};

export default function AppShell({ role, displayName, isAdmin, children }: Props) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);

  // Parents don't upload, so hide FAB and upload button for them
  const showUpload = role !== "parent";

  return (
    <div className="bvAppLayout">
      <a href="#main-content" className="bvSkipLink">Skip to content</a>
      
      {/* Desktop sidebar - hidden on mobile */}
      <DesktopSidebar role={role} isAdmin={isAdmin} />
      
      <div className="bvAppMain">
        {/* Top bar */}
        <div className="nav">
          <div className="navInner">
            <div className="bvTopBarLeft bvMobileOnly">
              <Link className="brand" href="/app" aria-label="Baseline Video home">
                <img className="bvAppLogo" src="/brand copy-Photoroom.png" alt="Baseline Video" />
              </Link>
            </div>
            <div className="bvTopBarRight">
              <button className="bvSearchBtn" onClick={() => setSearchOpen(true)} aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
                <span className="bvSearchBtnText">Search</span>
                <kbd className="bvSearchBtnKbd">⌘K</kbd>
              </button>
              <NotificationBell />
              {showUpload && (
                <Link className="btn btnPrimary bvDesktopOnly" href="/app/upload">
                  Upload
                </Link>
              )}
            </div>
          </div>
        </div>
        
        <main id="main-content" className="container">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      
      {showUpload && <UploadFAB />}
      <BottomNav role={role} onMoreClick={() => setMoreOpen(true)} />
      <ToastClient />
      
      <GlobalKeyboard 
        onHelp={() => setHelpOpen(true)} 
        onSearch={() => setSearchOpen(true)} 
      />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SearchCommand isCoach={role === "coach"} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MoreSheet 
        open={moreOpen} 
        onClose={() => setMoreOpen(false)} 
        role={role} 
        displayName={displayName}
        isAdmin={isAdmin}
      />
      <AnalyticsTracker />
    </div>
  );
}
