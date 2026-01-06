"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, X, MessageCircle, Calendar, FolderKanban, Users } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
};

const iconMap: Record<string, React.ReactNode> = {
  comment: <MessageCircle size={16} />,
  lesson_request: <Calendar size={16} />,
  lesson_approved: <Calendar size={16} />,
  lesson_declined: <Calendar size={16} />,
  lesson_cancelled: <Calendar size={16} />,
  lesson_reminder: <Calendar size={16} />,
  program_assignment: <FolderKanban size={16} />,
  program_feedback: <FolderKanban size={16} />,
  player_joined: <Users size={16} />,
  parent_linked: <Users size={16} />
};

function getNotificationLink(notification: Notification): string | null {
  const data = notification.data || {};
  
  switch (notification.type) {
    case "comment":
      return data.videoId ? `/app/videos/${data.videoId}` : null;
    case "lesson_request":
    case "lesson_approved":
    case "lesson_declined":
    case "lesson_cancelled":
    case "lesson_reminder":
      return "/app/lessons";
    case "program_assignment":
    case "program_feedback":
      return data.enrollmentId 
        ? `/app/programs/me/${data.enrollmentId}` 
        : "/app/programs/me";
    case "player_joined":
      return data.playerId ? `/app/player/${data.playerId}` : "/app/dashboard";
    default:
      return null;
  }
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Fetch notifications
  async function fetchNotifications() {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (!error && data) {
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read_at).length);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Initial fetch + polling
  React.useEffect(() => {
    fetchNotifications();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Mark single as read
  async function markAsRead(id: string) {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.rpc("mark_notification_read", { p_notification_id: id });
      
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }

  // Mark all as read
  async function markAllAsRead() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.rpc("mark_all_notifications_read");
      
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read_at) {
      markAsRead(notification.id);
    }
    setOpen(false);
  }

  return (
    <div className="bvNotificationBell" ref={panelRef}>
      <button
        className="bvNotificationButton"
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="bvNotificationBadge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="bvNotificationPanel">
          <div className="bvNotificationHeader">
            <span style={{ fontWeight: 700 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                className="bvNotificationMarkAll"
                onClick={markAllAsRead}
              >
                <Check size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div className="bvNotificationList">
            {loading && notifications.length === 0 ? (
              <div className="bvNotificationEmpty">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="bvNotificationEmpty">
                <Bell size={24} style={{ opacity: 0.3 }} />
                <div>No notifications yet</div>
              </div>
            ) : (
              notifications.map((n) => {
                const link = getNotificationLink(n);
                const content = (
                  <>
                    <div className="bvNotificationIcon">
                      {iconMap[n.type] || <Bell size={16} />}
                    </div>
                    <div className="bvNotificationContent">
                      <div className="bvNotificationTitle">{n.title}</div>
                      {n.body && (
                        <div className="bvNotificationBody">{n.body}</div>
                      )}
                      <div className="bvNotificationTime">{timeAgo(n.created_at)}</div>
                    </div>
                    {!n.read_at && <div className="bvNotificationDot" />}
                  </>
                );

                if (link) {
                  return (
                    <Link
                      key={n.id}
                      href={link}
                      className={`bvNotificationItem ${!n.read_at ? "bvNotificationUnread" : ""}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div
                    key={n.id}
                    className={`bvNotificationItem ${!n.read_at ? "bvNotificationUnread" : ""}`}
                    onClick={() => !n.read_at && markAsRead(n.id)}
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>

          <Link
            href="/app/notifications"
            className="bvNotificationViewAll"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

