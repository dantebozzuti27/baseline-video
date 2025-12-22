## Deploy Baseline Video (Vercel + Supabase)

### 1) Supabase setup
- Create a Supabase project
- In **SQL Editor**, run:
  - `supabase/migrations/0000_baseline_video_all.sql`
- In **Storage**, confirm bucket `videos` exists and is **private**
- If the SQL prints a NOTICE about skipping storage bucket/policies (ownership/privileges), create the bucket + policies in the Supabase dashboard instead.
- In **Auth**, for fastest v1:
  - Disable email confirmations (or adjust the signup pages to handle “pending confirmation”)

### 2) Local env vars
Create `.env.local` from `env.example` with:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_SITE_URL` (optional)

### 3) Vercel setup
- Import repo into Vercel
- Add the same env vars in Vercel Project Settings
- Deploy

### 4) Sanity test checklist (coach + two players)
- **Coach**:
  - Sign up as coach → receive access code
  - Visit `/app/dashboard` → see player list once players join
  - Upload a Training video → appears in coach context (and playable)
- **Player A**:
  - Sign up with access code
  - Upload a Game video → appears in their feed
  - Confirm they **cannot** see Player B’s videos
  - Comment on own video with timestamp
- **Player B**:
  - Sign up with same access code
  - Upload video
- **Coach**:
  - See both players on dashboard with recent counts
  - Drill into Player A page and see Player A videos
  - Open Player A video → playback works, comments visible


