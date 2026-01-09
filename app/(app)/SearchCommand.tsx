"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Video, User, FolderKanban, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

type Result = {
  videos: Array<{ id: string; title: string; category: string }>;
  players: Array<{ user_id: string; first_name: string; last_name: string; display_name: string }>;
  programs: Array<{ id: string; title: string }>;
};

export default function SearchCommand({ 
  isCoach, 
  open, 
  onClose 
}: { 
  isCoach: boolean; 
  open: boolean; 
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Result | null>(null);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when opened, clear when closed
  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Search
  React.useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await resp.json();
        setResults(data);
        // Track search event
        trackEvent("search", { 
          query, 
          resultsCount: (data?.videos?.length || 0) + (data?.players?.length || 0) + (data?.programs?.length || 0)
        });
      } catch {}
      setLoading(false);
    }, 400); // Slightly longer debounce to reduce event noise
    return () => clearTimeout(timer);
  }, [query]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  // Don't render anything when closed (AppShell has the trigger)
  if (!open) {
    return null;
  }

  const hasResults = results && (results.videos.length || results.players.length || results.programs.length);

  return (
    <div className="bvSearchBackdrop" onClick={onClose}>
      <div className="bvSearchModal" onClick={e => e.stopPropagation()}>
        <div className="bvSearchHeader">
          <Search size={18} className="bvSearchIcon" />
          <input
            ref={inputRef}
            type="text"
            className="bvSearchInput"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button className="bvSearchClose" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="bvSearchResults">
          {loading && <div className="bvSearchEmpty">Searching…</div>}
          {!loading && query.length >= 2 && !hasResults && <div className="bvSearchEmpty">No results</div>}
          {!loading && hasResults && (
            <>
              {results.videos.length > 0 && (
                <div className="bvSearchGroup">
                  <div className="bvSearchGroupLabel">Videos</div>
                  {results.videos.map(v => (
                    <button key={v.id} className="bvSearchItem" onClick={() => go(`/app/videos/${v.id}`)}>
                      <Video size={16} /><span>{v.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {isCoach && results.players.length > 0 && (
                <div className="bvSearchGroup">
                  <div className="bvSearchGroupLabel">Players</div>
                  {results.players.map(p => (
                    <button key={p.user_id} className="bvSearchItem" onClick={() => go(`/app/player/${p.user_id}`)}>
                      <User size={16} /><span>{p.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {isCoach && results.programs.length > 0 && (
                <div className="bvSearchGroup">
                  <div className="bvSearchGroupLabel">Programs</div>
                  {results.programs.map(p => (
                    <button key={p.id} className="bvSearchItem" onClick={() => go(`/app/programs/${p.id}`)}>
                      <FolderKanban size={16} /><span>{p.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {query.length < 2 && <div className="bvSearchEmpty">Type to search</div>}
        </div>
      </div>
    </div>
  );
}
