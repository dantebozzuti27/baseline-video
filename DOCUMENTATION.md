# Baseline Video - Complete Documentation

## Table of Contents
1. [Product Overview](#product-overview)
2. [Target Market](#target-market)
3. [User Roles](#user-roles)
4. [Features](#features)
5. [Technical Architecture](#technical-architecture)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [UI Components](#ui-components)
9. [Navigation](#navigation)
10. [Analytics and Monitoring](#analytics-and-monitoring)
11. [Authentication and Security](#authentication-and-security)
12. [PWA Features](#pwa-features)
13. [Deployment](#deployment)

---

## Product Overview

**Baseline Video** is an all-in-one coaching platform that enables sports coaches to scale their business through video-based feedback, lesson booking, and remote training programs.

### The Problem
- Coaches are drowning in WhatsApp messages and scattered video files
- Remote players receive generic PDFs instead of personalized training
- Administrative overhead limits how many players a coach can effectively manage
- No centralized platform for async video review and feedback
- Parents (who pay for lessons) have no visibility into their child's progress

### The Solution
A unified platform where:
- Players upload their swings/form for async review
- Coaches provide timestamped feedback with visual annotations
- Parents can monitor their children's progress and manage lessons
- Lessons are booked Calendly-style with coach availability
- Remote programs deliver structured, week-by-week training plans
- Everyone stays on the same page with real-time notifications

### Value Proposition
- **For Coaches**: 2x your roster without 2x the work
- **For Players**: Get better, faster, from anywhere in the world
- **For Parents**: Full visibility into your child's training
- **For All**: Geography no longer limits who you can help

---

## Target Market

### Primary Users

#### Sports Coaches
- Tennis, golf, baseball, swimming, and other technique-focused sports
- Solo practitioners or small coaching businesses
- Coaches who want to offer remote/hybrid training
- Age range: 25-55
- Tech comfort: Moderate (comfortable with basic apps)

#### Players/Athletes
- Amateur to semi-professional athletes
- Age range: 12-45 (parents may manage younger players)
- Looking for personalized feedback on their technique
- May be remote, in-person, or hybrid clients

#### Parents
- Parents of youth athletes (under 18)
- Decision makers and payers for coaching services
- Need visibility into their child's progress
- May manage multiple children

### Market Segments

| Segment | Description | Key Needs |
|---------|-------------|-----------|
| **In-Person** | Traditional face-to-face coaching | Lesson booking, video review between sessions |
| **Hybrid** | Mix of in-person and remote | All features, flexible scheduling |
| **Remote** | 100% online coaching | Programs, async video feedback, virtual lessons |

### Competitive Landscape
- **CoachNow**: Video sharing and communication
- **Hudl**: Team-focused video analysis
- **Veo**: AI-powered game recording
- **Generic tools**: WhatsApp, Dropbox, Google Calendar

**Baseline Video Differentiator**: The only platform where coaches, players, AND parents all have access.

---

## User Roles

### Coach
- Full team management
- Video library with instruction videos
- Program builder and drill library
- Lesson scheduling with availability settings
- Player roster with activity tracking
- Video annotation tools
- Admin dashboard access (if admin)

### Player
- Personal feed with their videos
- Upload videos for coach review
- View coach feedback with timestamps and annotations
- Request lessons at preferred times
- Follow daily program assignments
- Track progress through programs

### Parent
- View all videos for linked player(s)
- See lesson schedule and history
- Request/cancel lessons on behalf of player
- Receive notifications for new coach feedback
- Cannot upload videos or access other players' content
- Dashboard with quick-switch between linked children

### Admin
- Access to `/app/admin` monitoring dashboard
- Usage analytics and retention metrics
- Error logs and system health
- User and team management

---

## Features

### Core Features

#### 1. Video Upload and Feedback
- **Upload videos** directly or paste external links (YouTube, Vimeo)
- **PWA Share Target**: Upload directly from phone's share sheet
- **Categories**: Game footage vs Training footage
- **Timestamped comments** at specific video frames
- **Video annotations**: Draw circles, arrows, lines on paused frames
- **Coach feedback** with visual timestamp markers
- **Video library** for instruction videos
- **Pinning** to highlight important videos
- **Side-by-side comparison** of two videos (synced or independent playback)

#### 2. Video Annotation Tools
- **Canvas overlay** when video is paused
- **Drawing tools**: Freehand, straight line, arrow, circle, rectangle
- **Colors**: Red, yellow, green, blue, white
- **Undo/redo** and clear all
- **Save annotations** attached to specific timestamps
- **Playback with annotations** - annotations appear at their timestamps
- **Mobile support** - touch drawing with finger

#### 3. Lesson Booking System
- **Calendly-style booking**: Coach sets availability, players book open slots
- **Weekly recurring availability** (e.g., Tue/Thu 3-7pm)
- **Auto-approve** for bookings within available slots
- **Request flow backup**: Players can request times outside availability
- **Calendar view**: Outlook-style week/day calendar
- **Group lessons**: Support for 1-6 participants
- **Time blocks**: Coaches can block off unavailable times
- **Modes**: In-person or Remote (Zoom/video call)
- **Rescheduling**: Both parties can reschedule with notifications

#### 4. Remote Programs
- **Program templates**: Reusable training frameworks
- **Custom length**: 1-12 weeks, any cadence (days per cycle)
- **Daily plans**: Day-by-day assignments and goals
- **Focus areas**: Categorize training (e.g., "Backhand", "Footwork")
- **Drill library**: Structured drills with sets, reps, duration
- **Instruction videos**: Attach coach demos to drills
- **Per-player overrides**: Customize individual player's plans
- **Progress tracking**: Daily checklist for players
- **Program feed**: Coaches review player submissions

#### 5. Team Management
- **Player roster**: View all players, active/inactive status
- **Player modes**: Categorize as In-Person, Hybrid, or Remote
- **Invite links**: Shareable team join links
- **Coach-created accounts**: Create player accounts and send claim links
- **Player profiles**: Individual player dashboards
- **Parent invites**: Invite parents and link to players

#### 6. Notification System
- **In-app notifications**: Bell icon with unread count
- **Notification center**: Full list at `/app/notifications`
- **Notification types**:
  - New comment on video
  - Lesson request received (coach)
  - Lesson approved/declined (player)
  - New program assignment
- **Mark as read** on view

#### 7. Onboarding Flows
- **Coach onboarding**: Set availability, upload first video, invite first player
- **Player onboarding**: Welcome message, upload first video, enable notifications
- **Parent onboarding**: View connected player, quick tour, enable notifications

---

## Technical Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router) |
| **Styling** | CSS Variables, Custom CSS |
| **Backend** | Next.js API Routes (Edge) |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth |
| **Storage** | Supabase Storage |
| **Hosting** | Vercel |
| **Language** | TypeScript |

### Project Structure

```
baseline-video/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Authenticated app routes
│   │   ├── app/                  # Main app pages
│   │   │   ├── dashboard/        # Coach/player dashboard
│   │   │   ├── lessons/          # Lesson calendar
│   │   │   ├── programs/         # Remote programs
│   │   │   ├── library/          # Video library
│   │   │   ├── compare/          # Side-by-side comparison
│   │   │   ├── parent/           # Parent dashboard
│   │   │   ├── notifications/    # Notification center
│   │   │   ├── settings/         # User settings (includes schedule)
│   │   │   ├── admin/            # Admin monitoring
│   │   │   └── help/             # Help page
│   │   ├── videos/[id]/          # Video detail page
│   │   ├── upload/               # Upload page
│   │   │   └── share/            # PWA share target handler
│   │   ├── AppShell.tsx          # Main app layout wrapper
│   │   ├── DesktopSidebar.tsx    # Desktop left sidebar navigation
│   │   └── BottomNav.tsx         # Mobile bottom tabs
│   ├── (auth)/                   # Auth routes (sign-in, sign-up)
│   ├── (marketing)/              # Landing page
│   ├── onboarding/               # Multi-step onboarding flow
│   └── api/                      # API routes
├── components/                   # Reusable UI components
│   ├── VideoAnnotationCanvas.tsx # Drawing on video frames
│   ├── NotificationBell.tsx      # Notification indicator
│   ├── MoreSheet.tsx             # Mobile settings/profile sheet
│   └── ...
├── lib/                          # Utilities and helpers
│   ├── supabase/                 # Supabase clients (browser, server, admin)
│   ├── auth/                     # Auth helpers
│   ├── utils/                    # Utility functions
│   └── analytics.ts              # Event tracking
├── middleware.ts                 # Auth redirects and route protection
├── supabase/
│   ├── migrations/               # Individual database migrations
│   └── ALL_MIGRATIONS.sql        # Consolidated migration file
└── public/                       # Static assets
    └── manifest.json             # PWA manifest with share_target
```

### Key Architectural Decisions

1. **Server Components by Default**: Pages are RSC for faster initial load
2. **Client Components for Interactivity**: Forms, modals, calendars, annotations
3. **API Routes for Mutations**: All data changes go through API
4. **Supabase RLS**: Row-level security for data protection
5. **Admin Client for Server**: Bypass RLS for admin operations
6. **Middleware for Auth**: Centralized authentication redirects
7. **Desktop/Mobile Split**: Different nav patterns for different screen sizes

---

## Database Schema

### Core Tables

#### `teams`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Team name |
| invite_code | text | Unique join code |
| created_at | timestamp | Creation time |

#### `profiles`
| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid | FK to auth.users |
| team_id | uuid | FK to teams |
| role | enum | 'coach', 'player', or 'parent' |
| first_name | text | First name |
| last_name | text | Last name |
| display_name | text | Display name |
| is_active | boolean | Account status |
| is_admin | boolean | Admin access |
| player_mode | enum | 'in_person', 'hybrid', 'remote' |
| onboarding_completed | boolean | Completed onboarding |

#### `parent_player_links`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| parent_user_id | uuid | FK to profiles |
| player_user_id | uuid | FK to profiles |
| access_level | enum | 'view_only', 'full' |
| created_at | timestamp | Creation time |

#### `videos`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| uploader_user_id | uuid | Who uploaded |
| owner_user_id | uuid | Whose video it is |
| title | text | Video title |
| category | enum | 'game' or 'training' |
| source | enum | 'upload' or 'link' |
| storage_path | text | Supabase storage path |
| external_url | text | YouTube/Vimeo URL |
| pinned | boolean | Pinned by coach |
| is_library | boolean | In coach library |
| deleted_at | timestamp | Soft delete |

#### `comments`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| video_id | uuid | FK to videos |
| user_id | uuid | Author |
| body | text | Comment text |
| timestamp_seconds | decimal | Video timestamp |
| visibility | enum | 'player_visible', 'coach_only' |

#### `video_annotations`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| video_id | uuid | FK to videos |
| user_id | uuid | Creator |
| timestamp_seconds | decimal | Video timestamp |
| canvas_data | jsonb | Drawing data (paths, shapes, colors) |
| created_at | timestamp | Creation time |

#### `lessons`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| coach_user_id | uuid | Coach |
| mode | enum | 'in_person' or 'remote' |
| status | enum | 'pending', 'approved', 'declined', 'cancelled' |
| start_at | timestamp | Scheduled time |
| duration_minutes | integer | Duration |
| notes | text | Notes |
| auto_approved | boolean | Booked in available slot |

#### `lesson_participants`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| lesson_id | uuid | FK to lessons |
| user_id | uuid | Participant |
| status | enum | 'pending', 'accepted', 'declined' |

Note: Lessons support 1-6 participants (increased from 2).

#### `coach_availability`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| coach_user_id | uuid | FK to profiles |
| day_of_week | integer | 0=Sunday, 6=Saturday |
| start_time | time | Start of availability |
| end_time | time | End of availability |
| is_active | boolean | Currently active |

#### `notifications`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Recipient |
| type | text | Notification type |
| title | text | Title |
| body | text | Message body |
| data | jsonb | Additional data (links, etc.) |
| read_at | timestamp | When read |
| created_at | timestamp | When created |

### Program Tables

#### `program_templates`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| title | text | Program name |
| description | text | Description |
| weeks | integer | Number of weeks (1-12) |
| cycle_days | integer | Days per cycle (default 7) |

#### `program_template_days`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| template_id | uuid | FK to program_templates |
| week_index | integer | Week number (0-based) |
| day_index | integer | Day in week (0-based) |
| focus_id | uuid | FK to program_focuses |
| note | text | Day instructions |

#### `program_day_assignments`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| template_day_id | uuid | FK to program_template_days |
| drill_id | uuid | FK to program_drills |
| sets | integer | Number of sets |
| reps | integer | Reps per set |
| duration_seconds | integer | Duration |
| order_index | integer | Display order |

#### `program_enrollments`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| template_id | uuid | FK to program_templates |
| player_user_id | uuid | Enrolled player |
| status | enum | 'active', 'paused', 'completed' |
| start_date | date | When program starts |

### Analytics Tables

#### `analytics_events`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_type | text | Event name |
| user_id | uuid | User who triggered |
| team_id | uuid | Associated team |
| metadata | jsonb | Event data |
| created_at | timestamp | When it happened |

#### `error_logs`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| error_type | text | 'frontend', 'api', 'database' |
| message | text | Error message |
| stack | text | Stack trace |
| user_id | uuid | Affected user |
| endpoint | text | API endpoint |
| metadata | jsonb | Additional context |
| resolved_at | timestamp | When resolved |
| created_at | timestamp | When occurred |

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/sign-out` | Sign out user |
| POST | `/api/onboarding/coach` | Create coach account and team |
| POST | `/api/onboarding/player` | Join team as player |
| POST | `/api/onboarding/parent` | Join as parent, link to player |

### Videos
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/videos` | Create video |
| GET | `/api/videos/[id]` | Get video details |
| DELETE | `/api/videos/[id]` | Soft delete video |
| POST | `/api/videos/[id]/comments` | Add comment |
| POST | `/api/videos/[id]/annotations` | Save annotation |
| GET | `/api/videos/[id]/annotations` | Get annotations |
| POST | `/api/videos/[id]/purge` | Permanently delete |
| POST | `/api/videos/[id]/restore` | Restore from trash |

### Lessons
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/lessons/request` | Request a lesson |
| POST | `/api/lessons/create` | Coach creates lesson |
| POST | `/api/lessons/[id]/respond` | Approve/decline |
| POST | `/api/lessons/[id]/reschedule` | Reschedule |
| POST | `/api/lessons/[id]/cancel` | Cancel lesson |
| GET | `/api/lessons/blocks` | Get coach blocks |
| POST | `/api/lessons/blocks` | Create time block |
| GET | `/api/lessons/availability` | Get coach available slots |
| POST | `/api/lessons/availability` | Set coach availability |

### Programs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/programs/templates` | Create template |
| GET | `/api/programs/templates/[id]` | Get template |
| DELETE | `/api/programs/templates/[id]` | Delete template |
| POST | `/api/programs/templates/[id]/duplicate` | Duplicate |
| POST | `/api/programs/enrollments` | Enroll player |
| POST | `/api/programs/drills` | Create drill |
| POST | `/api/programs/focuses` | Create focus |

### Team Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/team/players` | Get roster |
| POST | `/api/team/players/create` | Create player account |
| POST | `/api/team/invite` | Regenerate invite |
| POST | `/api/team/parents` | Invite parent |
| POST | `/api/claim/[token]/complete` | Claim account |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get user notifications |
| POST | `/api/notifications/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all as read |

### Analytics (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analytics/event` | Log event |
| POST | `/api/analytics/error` | Log error |
| GET | `/api/admin/stats` | Get overview stats |

### Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/share` | Handle PWA share target upload |

---

## UI Components

### Core Components (`components/ui.tsx`)
- **Button**: Primary, secondary, danger variants
- **LinkButton**: Button-styled links
- **Card**: Content containers
- **Input**: Text inputs with validation
- **Select**: Dropdown selects
- **Modal**: Dialog overlays
- **Pill**: Status badges (6 variants)
- **Textarea**: Multi-line text input

### Specialized Components
| Component | Purpose |
|-----------|---------|
| `Avatar` | User initials with auto-color |
| `Badge` / `Dot` | Notification indicators |
| `Breadcrumbs` | Page navigation trail |
| `DataTable` | Sortable, searchable tables with export |
| `EmptyState` | Placeholder for empty pages |
| `ErrorBoundary` | React error catching |
| `ProgressBar` | Progress visualization |
| `Skeleton` | Loading placeholders |
| `Spinner` | Loading indicator |
| `TimeAgo` | Live-updating relative times |
| `Tooltip` | Hover tooltips |
| `VideoAnnotationCanvas` | Drawing on video frames |
| `NotificationBell` | Header notification icon with count |
| `MoreSheet` | Mobile settings/profile sheet |

### App Shell Components
| Component | Purpose |
|-----------|---------|
| `AppShell` | Main layout wrapper |
| `DesktopSidebar` | Left sidebar navigation (desktop) |
| `BottomNav` | Mobile bottom tabs |
| `UploadFAB` | Floating upload button (mobile) |
| `SearchCommand` | Cmd+K command palette |
| `KeyboardHelp` | Keyboard shortcuts modal |
| `ToastClient` | Notification toasts |

---

## Navigation

### Desktop Layout (1024px+)
- **Left Sidebar**: Always visible, 240px wide
  - Logo at top
  - Main nav: Dashboard, Lessons, Upload, Programs, Video Library, Compare
  - Divider
  - Secondary nav: Program Library, Settings, Help, Admin (if admin)
- **Top Bar**: Search and notification bell only (logo in sidebar)
- **Bottom Nav**: Hidden on desktop

### Mobile Layout (< 1024px)
- **Top Bar**: Logo, search, notifications
- **Bottom Nav**: 5 items
  - Coach: Dashboard, Lessons, Upload, Library, More
  - Player: Feed, Lessons, Upload, Programs, More
  - Parent: Home, Schedule, Videos, Children, More
- **More Sheet**: Opens with Settings, Help, Profile, Sign Out
- **Upload FAB**: Floating action button (hidden for parents)

### Route-Based Navigation
- Active item highlighted in sidebar/bottom nav
- Prefix matching for nested routes (e.g., `/app/lessons/*` highlights Lessons)

---

## Analytics and Monitoring

### Admin Dashboard (`/app/admin`)

#### Overview Page
- Active users (24hr)
- Error count
- New uploads
- Scheduled lessons

#### Usage Analytics
- Daily Active Users (30-day chart)
- Events over time
- Peak usage hours
- Device breakdown (mobile/tablet/desktop)
- Browser and OS distribution
- Top pages visited
- Session duration

#### Retention
- Cohort retention heatmap
- Day 1/7/30 retention rates
- Churned users count
- At-risk users (inactive 14+ days)

#### Funnels
- Signup to First Upload to Active User
- Feature adoption rates
- Top search queries

#### Content Analytics
- Video stats by category/source
- Lesson stats by status/mode
- Program enrollment metrics
- Top uploaders

#### Teams
- Team leaderboard by engagement
- Coach effectiveness scores
- Player retention by coach

#### Users
- All users with last active status
- Filter by role, status, activity
- Video/lesson counts per user

#### Errors
- Error logs with drill-down
- Filter by type, endpoint
- Stack traces and metadata
- Mark as resolved

#### Health
- System status indicator
- Error rate (hourly/daily)
- Database row counts
- Storage estimates

### Tracked Events
| Event | When Triggered |
|-------|----------------|
| `page_view` | Every page navigation |
| `session_start` | App load |
| `session_end` | Browser close/navigate away |
| `user_active` | User interaction (debounced) |
| `video_upload` | Video created |
| `lesson_requested` | Lesson request |
| `coach_signup` | Coach registration |
| `player_signup` | Player registration |
| `parent_signup` | Parent registration |
| `search` | Search query executed |

---

## Authentication and Security

### Auth Flow
1. User signs up via Supabase Auth (email/password)
2. Redirected to onboarding flow
3. Profile created in `profiles` table
4. Team association established
5. Session stored in cookies

### Middleware Protection
- `/app/*` routes require authentication
- Unauthenticated users redirected to `/sign-in`
- Role-based redirects (parent to parent dashboard, etc.)
- Onboarding check for new users

### Role-Based Access
| Role | Permissions |
|------|-------------|
| **Coach** | Full team management, all features |
| **Player** | Own videos, lessons, programs |
| **Parent** | Linked children's data only |
| **Admin** | Monitoring dashboard access |

### Row-Level Security (RLS)
- All tables have RLS enabled
- Policies check `auth.uid()` and team membership
- Coaches can see all team data
- Players see own data + coach content
- Parents see linked children's data only

### Security Features
- HTTPS enforced
- Secure cookies
- CSRF protection via Supabase
- Input validation with Zod
- SQL injection prevention via parameterized queries

---

## PWA Features

### Manifest Configuration (`public/manifest.json`)
- App name, icons, theme colors
- Display mode: standalone
- Share target for video uploads

### Share Target
```json
"share_target": {
  "action": "/app/upload/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "files": [{ "name": "video", "accept": ["video/*"] }]
  }
}
```

Users can share videos directly from their phone's share sheet to upload.

### Add to Home Screen
- iOS web app meta tags
- Custom app icons
- Splash screen configuration

---

## Deployment

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### Deployment Steps
1. Push to `main` branch
2. Vercel auto-deploys
3. Run database migrations manually in Supabase SQL Editor

### Database Migrations
```bash
# Apply consolidated migrations
# Run in Supabase SQL Editor:
supabase/ALL_MIGRATIONS.sql
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open search |
| `?` | Open keyboard help |
| `Esc` | Close modal/drawer |
| `Space` | Play/pause video |
| `Left/Right` | Frame step (on video) |

---

## Completed Features

- [x] Parent access model with linked children
- [x] Video annotation tools (draw on frames)
- [x] Calendly-style lesson booking
- [x] Notification system (in-app)
- [x] Multi-step onboarding flows
- [x] Side-by-side video comparison
- [x] PWA share target for uploads
- [x] Desktop sidebar navigation
- [x] Simplified navigation (removed drawer)
- [x] Increased lesson participants (1-6)
- [x] Simplified comment visibility

## Future Roadmap

- [ ] Push notifications (Web Push API)
- [ ] Email notifications
- [ ] Video compression pipeline
- [ ] Real-time comment updates
- [ ] Calendar sync (Google/Apple)
- [ ] Payment/subscription integration
- [ ] Mobile app (React Native)
- [ ] AI-powered swing analysis
- [ ] White-label for academies

---

## Support

**Repository**: Private GitHub repo
**Hosting**: Vercel
**Database**: Supabase
**Domain**: baseline-video.vercel.app

---

*Last updated: January 2026*
