import { getMyProfile } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { 
  Video, 
  Calendar, 
  FolderKanban, 
  Upload, 
  Search,
  Keyboard,
  MessageCircle,
  Users,
  Settings
} from "lucide-react";

export const dynamic = "force-dynamic";

const helpSections = [
  {
    title: "Getting Started",
    icon: <Video size={24} />,
    items: [
      { q: "How do I upload a video?", a: "Tap the Upload button in the bottom navigation or use the floating action button on mobile. Select a video from your device, add a title, and choose the category (game or training)." },
      { q: "What video formats are supported?", a: "We support all common video formats including MP4, MOV, and AVI. Videos are automatically optimized for playback." },
      { q: "Can I upload external links?", a: "Yes! You can paste YouTube, Vimeo, or other video links instead of uploading a file directly." }
    ]
  },
  {
    title: "Video Feedback",
    icon: <MessageCircle size={24} />,
    items: [
      { q: "How do I add timestamped comments?", a: "While watching a video, pause at the moment you want to comment on. Click the comment input and your comment will be linked to that timestamp." },
      { q: "Can players see all comments?", a: "Coaches can choose to make comments visible to the player or keep them as private coach notes." }
    ]
  },
  {
    title: "Lessons",
    icon: <Calendar size={24} />,
    items: [
      { q: "How do players request lessons?", a: "Players can view the coach's calendar and request available time slots. Coaches then approve or decline requests." },
      { q: "Can I reschedule a lesson?", a: "Yes, both coaches and players can request to reschedule. Coach reschedules are automatic; player reschedules require coach approval." },
      { q: "What are 2-on-1 lessons?", a: "Coaches can add a second player to any lesson for group instruction. The second player must accept the invite." }
    ]
  },
  {
    title: "Programs",
    icon: <FolderKanban size={24} />,
    items: [
      { q: "What is a training program?", a: "Programs are structured, multi-week training plans that coaches create and assign to players. They include daily assignments, drills, and instruction videos." },
      { q: "How do I complete program assignments?", a: "As a player, go to your active program, view the current day's assignments, and mark them complete or upload requested videos." }
    ]
  },
  {
    title: "For Parents",
    icon: <Users size={24} />,
    items: [
      { q: "How do I see my child's videos?", a: "Once your coach links you to your child's account, you'll see all their videos and feedback on your dashboard." },
      { q: "Can I request lessons for my child?", a: "Yes, if your coach has given you 'full access', you can request and manage lessons on behalf of your child." }
    ]
  },
  {
    title: "Keyboard Shortcuts",
    icon: <Keyboard size={24} />,
    items: [
      { q: "What shortcuts are available?", a: "Press ? anywhere to see all keyboard shortcuts. Key ones include: ⌘K for search, Space for play/pause, and arrow keys for frame-by-frame stepping." }
    ]
  }
];

export default async function HelpPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  return (
    <div className="stack">
      <Breadcrumbs items={[{ label: "Help" }]} />

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
          Help Center
        </h1>
        <p className="muted">
          Find answers to common questions about Baseline Video.
        </p>
      </div>

      <div className="stack" style={{ gap: 24 }}>
        {helpSections.map((section) => (
          <Card key={section.title}>
            <div className="row" style={{ alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ color: "var(--primary)" }}>{section.icon}</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{section.title}</h2>
            </div>

            <div className="stack" style={{ gap: 16 }}>
              {section.items.map((item, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.q}</div>
                  <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{item.a}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div style={{ textAlign: "center", padding: "24px 16px" }}>
          <Settings size={32} style={{ color: "var(--muted)", marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Need more help?
          </h3>
          <p className="muted" style={{ maxWidth: 400, margin: "0 auto" }}>
            Contact your coach directly or email support at help@baselinevideo.com
          </p>
        </div>
      </Card>
    </div>
  );
}

