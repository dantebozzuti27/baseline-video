# Baseline Video

**The all-in-one coaching platform that lets sports coaches scale their business beyond the court.**

Video feedback, lesson booking, and remote training programs — all in one place.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black)

---

## 🎯 What is Baseline Video?

Baseline Video solves a common problem for sports coaches: managing players across video review, lesson scheduling, and remote training is fragmented across WhatsApp, Dropbox, and spreadsheets.

**Our solution:**
- 📹 **Video Feedback** — Players upload, coaches comment at exact timestamps
- 📅 **Lesson Booking** — Players request, coaches approve, calendar syncs
- 📋 **Remote Programs** — Week-by-week training plans with drills and daily checklists
- 👥 **Team Management** — Roster, player modes, invite links

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **Timestamped Comments** | Coaches leave feedback at the exact video frame |
| **Side-by-Side Compare** | Compare two videos for technique analysis |
| **Outlook-Style Calendar** | Week/day view with drag-and-drop scheduling |
| **2-on-1 Lessons** | Support for group lessons with multiple players |
| **Custom Programs** | 1-52 weeks, any cadence, per-player overrides |
| **Drill Library** | Structured drills with instruction videos |
| **Player Modes** | In-person, Hybrid, or Remote categorization |
| **Admin Dashboard** | Usage analytics, retention, funnels, error monitoring |

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React 18 |
| Styling | CSS Variables, Custom Components |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Vercel |
| Language | TypeScript |

## 📁 Project Structure

```
baseline-video/
├── app/                    # Next.js App Router
│   ├── (app)/              # Authenticated routes
│   │   ├── app/            # Main app pages
│   │   │   ├── dashboard/  # Home dashboard
│   │   │   ├── lessons/    # Lesson calendar
│   │   │   ├── programs/   # Remote programs
│   │   │   ├── library/    # Video library
│   │   │   ├── admin/      # Analytics dashboard
│   │   │   └── settings/   # User settings
│   │   └── videos/[id]/    # Video detail & comments
│   ├── (auth)/             # Sign-in, sign-up, claim
│   ├── (marketing)/        # Landing page
│   └── api/                # API routes
├── components/             # Reusable UI components
├── lib/                    # Utilities, Supabase clients
├── supabase/migrations/    # Database migrations
└── public/                 # Static assets
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Local Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/your-repo/baseline-video.git
   cd baseline-video
   npm install
   ```

2. **Configure environment**
   ```bash
   cp env.example .env.local
   ```
   
   Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

3. **Set up database**
   
   Run in Supabase SQL Editor:
   ```bash
   # Base schema
   supabase/migrations/0000_baseline_video_all.sql
   
   # All incremental migrations
   supabase/migrations/9999_apply_all_incremental.sql
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000)

### First Steps
1. Sign up as a **Coach** to create a team
2. Copy your team invite link from Settings
3. Sign up as a **Player** using the invite link
4. Upload a video and test the feedback flow

## 📊 Admin Dashboard

Access at `/app/admin` (requires `is_admin = true` in profiles table).

| Page | What It Shows |
|------|---------------|
| **Overview** | Key metrics at a glance |
| **Usage** | DAU, events, devices, peak hours |
| **Retention** | Cohort analysis, churn tracking |
| **Funnels** | Activation funnel, feature adoption |
| **Content** | Video, lesson, program stats |
| **Teams** | Leaderboard, coach effectiveness |
| **Users** | All users with last active status |
| **Errors** | Error logs with stack traces |
| **Health** | System status, database stats |

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Open search |
| `?` | Keyboard help |
| `Esc` | Close modal |
| `Space` | Play/pause video |
| `←` `→` | Frame step |

## 🚢 Deployment

### Vercel (Recommended)
1. Connect GitHub repo to Vercel
2. Add environment variables
3. Deploy

### Environment Variables for Production
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## 📚 Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for:
- Complete feature list
- Database schema
- API reference
- UI components
- Security details

## 📝 Other Docs

| File | Description |
|------|-------------|
| [DOCUMENTATION.md](./DOCUMENTATION.md) | Full technical documentation |
| [AUDIT.md](./AUDIT.md) | UI/UX audit findings |
| [AUDIT_LOG.md](./AUDIT_LOG.md) | Implementation log |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment notes |

## 🗺 Roadmap

- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] AI-powered swing analysis
- [ ] Payment integration
- [ ] Calendar sync (Google/Apple)
- [ ] Video annotations/drawing tools

---

Built with ❤️ for coaches who want to scale their impact.
