# Baseline Video - Complete Documentation

## Table of Contents
1. [Product Overview](#product-overview)
2. [Target Market](#target-market)
3. [Features](#features)
4. [Technical Architecture](#technical-architecture)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [UI Components](#ui-components)
8. [Analytics & Monitoring](#analytics--monitoring)
9. [Authentication & Security](#authentication--security)
10. [Deployment](#deployment)

---

## Product Overview

**Baseline Video** is an all-in-one coaching platform that enables sports coaches to scale their business through video-based feedback, lesson booking, and remote training programs.

### The Problem
- Coaches are drowning in WhatsApp messages and scattered video files
- Remote players receive generic PDFs instead of personalized training
- Administrative overhead limits how many players a coach can effectively manage
- No centralized platform for async video review and feedback

### The Solution
A unified platform where:
- Players upload their swings/form for async review
- Coaches provide timestamped feedback at the exact frame
- Lessons are booked and managed in one place
- Remote programs deliver structured, week-by-week training plans
- Everyone stays on the same page with real-time updates

### Value Proposition
- **For Coaches**: 2x your roster without 2x the work
- **For Players**: Get better, faster, from anywhere in the world
- **For Both**: Geography no longer limits who you can help

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

**Baseline Video Differentiator**: All-in-one platform combining video feedback, lesson booking, AND structured remote programs.

---

## Features

### Core Features

#### 1. Video Upload & Feedback
- **Upload videos** directly or paste external links (YouTube, Vimeo)
- **Categories**: Game footage vs Training footage
- **Timestamped comments** at specific video frames
- **Coach feedback** with visual timestamp markers
- **Video library** for instruction videos
- **Pinning** to highlight important videos
- **Side-by-side comparison** of two videos

#### 2. Lesson Booking System
- **Player requests**: Players propose times for lessons
- **Coach approval**: Coaches approve, decline, or reschedule
- **Calendar view**: Outlook-style week/day calendar
- **2-on-1 lessons**: Support for group lessons with two players
- **Time blocks**: Coaches can block off unavailable times
- **Modes**: In-person or Remote (Zoom/video call)
- **Rescheduling**: Both parties can reschedule with notifications

#### 3. Remote Programs
- **Program templates**: Reusable training frameworks
- **Custom length**: 1-52 weeks, any cadence (days per cycle)
- **Daily plans**: Day-by-day assignments and goals
- **Focus areas**: Categorize training (e.g., "Backhand", "Footwork")
- **Drill library**: Structured drills with sets, reps, duration
- **Instruction videos**: Attach coach demos to drills
- **Per-player overrides**: Customize individual player's plans
- **Progress tracking**: Daily checklist for players
- **Program feed**: Coaches review player submissions

#### 4. Team Management
- **Player roster**: View all players, active/inactive status
- **Player modes**: Categorize as In-Person, Hybrid, or Remote
- **Invite links**: Shareable team join links
- **Coach-created accounts**: Create player accounts and send claim links
- **Player profiles**: Individual player dashboards

### Coach Features
- Dashboard with team overview and stats
- Video library management
- Program builder with drag-and-drop
- Lesson calendar with time blocking
- Player roster with activity tracking
- Bulk video upload for players

### Player Features
- Personal feed with their videos
- Upload videos for coach review
- View coach feedback with timestamps
- Request lessons at preferred times
- Follow daily program assignments
- Track progress through programs

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
│   │   │   ├── settings/         # User settings
│   │   │   ├── admin/            # Admin monitoring
│   │   │   └── videos/[id]/      # Video detail page
│   │   ├── AppShell.tsx          # Main app layout wrapper
│   │   ├── DrawerNav.tsx         # Sidebar navigation
│   │   └── BottomNav.tsx         # Mobile bottom tabs
│   ├── (auth)/                   # Auth routes (sign-in, sign-up)
│   ├── (marketing)/              # Landing page
│   └── api/                      # API routes
├── components/                   # Reusable UI components
├── lib/                          # Utilities and helpers
│   ├── supabase/                 # Supabase clients
│   ├── auth/                     # Auth helpers
│   ├── utils/                    # Utility functions
│   └── analytics.ts              # Event tracking
├── supabase/
│   └── migrations/               # Database migrations
└── public/                       # Static assets
```

### Key Architectural Decisions

1. **Server Components by Default**: Pages are RSC for faster initial load
2. **Client Components for Interactivity**: Forms, modals, calendars
3. **API Routes for Mutations**: All data changes go through API
4. **Supabase RLS**: Row-level security for data protection
5. **Admin Client for Server**: Bypass RLS for admin operations

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
| role | enum | 'coach' or 'player' |
| first_name | text | First name |
| last_name | text | Last name |
| display_name | text | Display name |
| is_active | boolean | Account status |
| is_admin | boolean | Admin access |
| player_mode | enum | 'in_person', 'hybrid', 'remote' |

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
| visibility | enum | 'public', 'coach_only', 'private' |

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

#### `lesson_participants`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| lesson_id | uuid | FK to lessons |
| user_id | uuid | Participant |
| status | enum | 'pending', 'accepted', 'declined' |

### Program Tables

#### `program_templates`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| title | text | Program name |
| description | text | Description |
| weeks | integer | Number of weeks |
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

#### `program_focuses`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| name | text | Focus name (e.g., "Backhand") |
| color | text | Display color |

#### `program_drills`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| name | text | Drill name |
| description | text | Instructions |
| category | enum | 'warmup', 'skill', 'conditioning', etc. |

#### `program_drill_media`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| drill_id | uuid | FK to program_drills |
| kind | enum | 'video', 'image', 'link' |
| url | text | Media URL |

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
| error_type | enum | 'frontend', 'api', 'database' |
| message | text | Error message |
| stack | text | Stack trace |
| user_id | uuid | Affected user |
| endpoint | text | API endpoint |
| resolved_at | timestamp | When resolved |

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/sign-out` | Sign out user |
| POST | `/api/onboarding/coach` | Create coach account |
| POST | `/api/onboarding/player` | Join team as player |

### Videos
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/videos` | Create video |
| GET | `/api/videos/[id]` | Get video details |
| DELETE | `/api/videos/[id]` | Soft delete video |
| POST | `/api/videos/[id]/comments` | Add comment |
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
| POST | `/api/claim/[token]/complete` | Claim account |

### Analytics (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analytics/event` | Log event |
| POST | `/api/analytics/error` | Log error |
| GET | `/api/admin/stats` | Get overview stats |

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

### App Shell Components
| Component | Purpose |
|-----------|---------|
| `AppShell` | Main layout wrapper |
| `DrawerNav` | Mobile slide-out menu |
| `BottomNav` | Mobile bottom tabs |
| `UploadFAB` | Floating upload button |
| `SearchCommand` | ⌘K command palette |
| `KeyboardHelp` | Keyboard shortcuts modal |
| `ToastClient` | Notification toasts |

---

## Analytics & Monitoring

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
- Browser & OS distribution
- Top pages visited
- Session duration

#### Retention
- Cohort retention heatmap
- Day 1/7/30 retention rates
- Churned users count
- At-risk users (inactive 14+ days)

#### Funnels
- Signup → First Upload → Active User
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
| `search` | Search query executed |

---

## Authentication & Security

### Auth Flow
1. User signs up via Supabase Auth (email/password)
2. Profile created in `profiles` table
3. Team association established
4. Session stored in cookies

### Role-Based Access
| Role | Permissions |
|------|-------------|
| **Coach** | Full team management, all features |
| **Player** | Own videos, lessons, programs |
| **Admin** | Monitoring dashboard access |

### Row-Level Security (RLS)
- All tables have RLS enabled
- Policies check `auth.uid()` and team membership
- Coaches can see all team data
- Players see own data + coach content

### Security Features
- HTTPS enforced
- Secure cookies
- CSRF protection via Supabase
- Input validation with Zod
- SQL injection prevention via parameterized queries

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
3. Run database migrations manually in Supabase

### Database Migrations
```bash
# Apply all migrations
psql $DATABASE_URL < supabase/migrations/9999_apply_all_incremental.sql
```

### PWA Support
- `manifest.json` for installability
- iOS web app meta tags
- Custom app icons

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open search |
| `?` | Open keyboard help |
| `Esc` | Close modal/drawer |
| `Space` | Play/pause video |
| `←` / `→` | Frame step (on video) |

---

## Future Roadmap

### Planned Features
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] AI-powered swing analysis
- [ ] Payment/subscription integration
- [ ] White-label for academies
- [ ] Advanced analytics exports
- [ ] Calendar sync (Google/Apple)
- [ ] Video annotations/drawing

### Technical Improvements
- [ ] Real-time dashboard updates
- [ ] Offline support (PWA)
- [ ] Video compression/optimization
- [ ] CDN for video delivery
- [ ] Rate limiting
- [ ] Audit logging

---

## Support

For technical issues or questions, contact the development team.

**Repository**: Private GitHub repo
**Hosting**: Vercel
**Database**: Supabase
**Domain**: baseline-video.vercel.app

---

*Last updated: January 2026*

