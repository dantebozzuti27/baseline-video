# Baseline Video

**The all-in-one coaching platform that lets sports coaches scale their business beyond the court.**

Video feedback, lesson booking, and remote training programs - all in one place.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black)

---

## What is Baseline Video?

Baseline Video solves a common problem for sports coaches: managing players across video review, lesson scheduling, and remote training is fragmented across WhatsApp, Dropbox, and spreadsheets.

**Our solution:**
- **Video Feedback** - Players upload, coaches comment at exact timestamps with drawing annotations
- **Lesson Booking** - Calendly-style scheduling with coach availability
- **Remote Programs** - Week-by-week training plans with drills and daily checklists
- **Team Management** - Roster, player modes, invite links
- **Parent Access** - Parents can view their children's progress and manage lessons

## Key Features

| Feature | Description |
|---------|-------------|
| **Timestamped Comments** | Coaches leave feedback at the exact video frame |
| **Video Annotations** | Draw circles, arrows, and lines directly on video frames |
| **Side-by-Side Compare** | Compare two videos for technique analysis |
| **Calendly-Style Booking** | Coach sets availability, players book open slots |
| **2-on-1+ Lessons** | Support for group lessons with multiple players (up to 6) |
| **Custom Programs** | 1-12 weeks, any cadence, per-player overrides |
| **Drill Library** | Structured drills with instruction videos |
| **Player Modes** | In-person, Hybrid, or Remote categorization |
| **Parent Dashboard** | Parents view their children's videos and schedule |
| **Push Notifications** | Real-time alerts for new feedback and lesson updates |
| **PWA Share Target** | Upload videos directly from phone's share sheet |
| **Admin Dashboard** | Usage analytics, retention, funnels, error monitoring |

## User Roles

| Role | Permissions |
|------|-------------|
| **Coach** | Full team management, video library, programs, lesson scheduling |
| **Player** | Upload videos, view feedback, request lessons, follow programs |
| **Parent** | View linked children's videos and lessons, manage on their behalf |
| **Admin** | Access to monitoring dashboard and error logs |

## Tech Stack

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

## Project Structure

```
baseline-video/
├── app/                    # Next.js App Router
│   ├── (app)/              # Authenticated routes
│   │   ├── app/            # Main app pages
│   │   │   ├── dashboard/  # Coach dashboard
│   │   │   ├── lessons/    # Lesson calendar
│   │   │   ├── programs/   # Remote programs
│   │   │   ├── library/    # Video library
│   │   │   ├── compare/    # Side-by-side comparison
│   │   │   ├── parent/     # Parent dashboard
│   │   │   ├── notifications/ # Notification center
│   │   │   ├── admin/      # Analytics dashboard
│   │   │   └── settings/   # User settings
│   │   ├── videos/[id]/    # Video detail & comments
│   │   ├── upload/         # Video upload (including share target)
│   │   ├── AppShell.tsx    # Main layout wrapper
│   │   ├── DesktopSidebar.tsx # Desktop navigation sidebar
│   │   └── BottomNav.tsx   # Mobile bottom navigation
│   ├── (auth)/             # Sign-in, sign-up, claim
│   ├── (marketing)/        # Landing page
│   ├── onboarding/         # Multi-step onboarding flow
│   └── api/                # API routes
├── components/             # Reusable UI components
│   ├── VideoAnnotationCanvas.tsx # Drawing annotations
│   ├── NotificationBell.tsx # Notification indicator
│   ├── MoreSheet.tsx       # Mobile settings sheet
│   └── ...
├── lib/                    # Utilities, Supabase clients
├── supabase/migrations/    # Database migrations
└── public/                 # Static assets (manifest.json for PWA)
```

## Getting Started

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
   # Complete consolidated migrations
   supabase/ALL_MIGRATIONS.sql
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000)

### First Steps
1. Sign up as a **Coach** to create a team
2. Complete the onboarding flow (set availability, invite first player)
3. Copy your team invite link from Settings
4. Sign up as a **Player** using the invite link
5. Upload a video and test the feedback flow

## Navigation

### Desktop (1024px+)
- Left sidebar with all navigation items
- Logo at top, main nav, then secondary nav (Settings, Help, Admin)

### Mobile
- Bottom navigation bar with 5 items
- "More" button opens sheet with Settings, Help, Profile, Sign Out

## Admin Dashboard

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

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open search |
| `?` | Keyboard help |
| `Esc` | Close modal |
| `Space` | Play/pause video |
| `Arrow Left/Right` | Frame step |

## PWA Features

- **Share Target**: Share videos directly from phone to upload
- **Add to Home Screen**: Install as app on iOS/Android
- **Notifications**: Push notifications for new feedback

## Deployment

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

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for:
- Complete feature list
- Database schema
- API reference
- UI components
- Security details

## Other Docs

| File | Description |
|------|-------------|
| [DOCUMENTATION.md](./DOCUMENTATION.md) | Full technical documentation |
| [OUTSIDE_AUDIT_ACTION.md](./OUTSIDE_AUDIT_ACTION.md) | Feature implementation plan |
| [AUDIT.md](./AUDIT.md) | UI/UX audit findings |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment notes |

## Completed Roadmap

- [x] Parent access model
- [x] Video annotations/drawing tools
- [x] Calendly-style lesson booking
- [x] Push notifications
- [x] Multi-step onboarding flows
- [x] Side-by-side video comparison
- [x] PWA share target upload
- [x] Desktop sidebar navigation
- [x] Simplified navigation (removed drawer)
- [x] Increased lesson participant limit (6)

## Future Roadmap

- [ ] Video compression pipeline
- [ ] Real-time comment updates
- [ ] Calendar sync (Google/Apple)
- [ ] Payment integration
- [ ] Mobile app (React Native)
- [ ] AI-powered swing analysis

---

Built for coaches who want to scale their impact.
