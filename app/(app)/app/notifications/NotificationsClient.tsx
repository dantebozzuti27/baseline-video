"use client";

import * as React from "react";
import Link from "next/link";
import { Card, Button, Pill } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { 
  Bell, 
  Check, 
  MessageCircle, 
  Calendar, 
  FolderKanban, 
  Users,
  CheckCheck 
} from "lucide-react";
import { formatDate } from "@/lib/utils/datetime";

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
  comment: <MessageCircle size={20} />,
  lesson_request: <Calendar size={20} />,
  lesson_approved: <Calendar size={20} />,
  lesson_declined: <Calendar size={20} />,
  lesson_cancelled: <Calendar size={20} />,
  lesson_reminder: <Calendar size={20} />,
  program_assignment: <FolderKanban size={20} />,
  program_feedback: <FolderKanban size={20} />,
  player_joined: <Users size={20} />,
  parent_linked: <Users size={20} />
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

export default function NotificationsClient({ notifications: initial }: { notifications: Notification[] }) {
  const [notifications, setNotifications] = React.useState(initial);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");

  const filteredNotifications = filter === "unread" 
    ? notifications.filter((n) => !n.read_at)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markAsRead(id: string) {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.rpc("mark_notification_read", { p_notification_id: id });
      
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch {
      // ignore
    }
  }

  async function markAllAsRead() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.rpc("mark_all_notifications_read");
      
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch {
      // ignore
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row">
          <button
            className={filter === "all" ? "pill" : "btn"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={filter === "unread" ? "pill" : "btn"}
            onClick={() => setFilter("unread")}
          >
            Unread ({unreadCount})
          </button>
        </div>
        
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead}>
            <CheckCheck size={16} />
            Mark all read
          </Button>
        )}
      </div>

      {filteredNotifications.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <Bell size={32} style={{ color: "var(--muted)", marginBottom: 12 }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {filter === "unread" ? "No unread notifications" : "No notifications"}
            </h3>
            <p className="muted">
              {filter === "unread" 
                ? "You're all caught up!" 
                : "You'll see updates about your videos, lessons, and programs here."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {filteredNotifications.map((n) => {
            const link = getNotificationLink(n);
            const Icon = iconMap[n.type] || <Bell size={20} />;

            const content = (
              <div 
                className={`card ${n.read_at ? "" : "cardInteractive"}`}
                style={{ 
                  background: !n.read_at ? "rgba(99, 179, 255, 0.05)" : undefined 
                }}
              >
                <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: "rgba(99, 179, 255, 0.15)",
                      color: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    {Icon}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{n.title}</div>
                      {!n.read_at && (
                        <Pill variant="info">New</Pill>
                      )}
                    </div>
                    
                    {n.body && (
                      <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                        {n.body}
                      </div>
                    )}
                    
                    <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      {formatDate(n.created_at, "long")}
                    </div>
                  </div>

                  {!n.read_at && !link && (
                    <button
                      className="btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markAsRead(n.id);
                      }}
                      style={{ flexShrink: 0 }}
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              </div>
            );

            if (link) {
              return (
                <Link 
                  key={n.id} 
                  href={link}
                  onClick={() => !n.read_at && markAsRead(n.id)}
                  style={{ textDecoration: "none" }}
                >
                  {content}
                </Link>
              );
            }

            return <div key={n.id}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}

