# Baseline Video

Simple, purpose-built video management for baseball coaches and players.

## Stack
- Next.js (App Router)
- Supabase (Auth + Postgres + Storage)

## Local setup
1. Install dependencies:
   - `npm install`
2. Create an env file (this repo can’t commit `.env*` templates in this environment):
   - Copy `env.example` to `.env.local`
3. Create a Supabase project and apply SQL:
   - Run `supabase/migrations/0000_baseline_video_all.sql` in the Supabase SQL editor
4. Run the app:
   - `npm run dev`

## Deploy
- Deploy Next.js to Vercel
- Set env vars in Vercel from `.env.local`


