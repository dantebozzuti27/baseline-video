"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Video, User, FolderKanban, X } from "lucide-react";

type Result = {
  videos: Array<{ id: string; title: string; category: string }>;
  players: Array<{ user_id: string; first_name: string; last_name: string; display_name: string }>;
  programs: Array<{ id: string; title: string }>;
};

export default function SearchCommand({ isCoach }: { isCoach: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Result | null>(null);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut: Cmd+K or Ctrl+K
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await resp.json();
        setResults(data);
      } catch (e) {
        console.error("search failed", e);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  const hasResults = results && (results.videos.length || results.players.length || results.programs.length);

  if (!open) {
    return (
      <button className="bvSearchTrigger" onClick={() => setOpen(true)} aria-label="Search">
        <Search size={18} />
        <span className="bvSearchPlaceholder">Search…</span>
        <kbd className="bvSearchKbd">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="bvSearchBackdrop" onClick={() => setOpen(false)}>
      <div className="bvSearchModal" onClick={(e) => e.stopPropagation()}>
        <div className="bvSearchHeader">
          <Search size={18} className="bvSearchIcon" />
          <input
            ref={inputRef}
            type="text"
            className="bvSearchInput"
            placeholder="Search videos, players, programs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="bvSearchClose" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="bvSearchResults">
          {loading && <div className="bvSearchEmpty">Searching…</div>}
          
          {!loading && query.length >= 2 && !hasResults && (
            <div className="bvSearchEmpty">No results found</div>
          )}

          {!loading && hasResults && (
            <>
              {results.videos.length > 0 && (
                <div className="bvSearchGroup">
                  <div className="bvSearchGroupLabel">Videos</div>
                  {results.videos.map((v) => (
                    <button
                      key={v.id}
                      className="bvSearchItem"
                      onClick={() => navigate(`/app/videos/${v.id}`)}
                    >
                      <Video size={16} />
                      <span>{v.title}</span>
                      <span className="pill" style={{ marginLeft: "auto" }}>{v.category?.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}

              {isCoach && results.players.length > 0 && (
                <div className="bvSearchGroup">
                  <div className="bvSearchGroupLabel">Players</div>
                  {results.players.map((p) => (
                    <button
                      key={p.user_id}
                      className="bvSearchItem"
                      onClick={() => navigate(`/app/player/${p.user_id}`)}
                    >
                      <User size={16} />
                      <span>{p.display_name || `${p.first_name} ${p.last_name}`}</span>
                    </button>
                  ))}
                </div>
              )}

              {isCoach && results.programs.length > 0 && (
                <div className="bvSearchGroup">
                  <div className="bvSearchGroupLabel">Programs</div>
                  {results.programs.map((p) => (
                    <button
                      key={p.id}
                      className="bvSearchItem"
                      onClick={() => navigate(`/app/programs/${p.id}`)}
                    >
                      <FolderKanban size={16} />
                      <span>{p.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {query.length < 2 && (
            <div className="bvSearchEmpty">Type at least 2 characters to search</div>
          )}
        </div>
      </div>
    </div>
  );
}

