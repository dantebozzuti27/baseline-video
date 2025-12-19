## Baseline Management — coaching app scaffold

Next.js (App Router, TypeScript, Tailwind v4) + Prisma/Postgres baseline for the baseball coaching product described in `../plan`. Branding updated to Baseline Management.

### Run locally
- `npm install`
- Add `.env` (see template below)
- `npx prisma generate && npx prisma migrate dev --name init`
- `npm run dev`
- Visit `http://localhost:3000`

### Environment
Create `.env` in `app/`:
```
DATABASE_URL="postgresql://user:pass@localhost:5432/putsky"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
R2_BUCKET="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
NEXT_PUBLIC_BASE_URL="https://baseline-video.vercel.app"
NEXTAUTH_URL="https://baseline-video.vercel.app"
ADMIN_API_TOKEN="set-a-strong-admin-token"
R2_PUBLIC_BASE_URL="https://<public-cdn-base>/your-bucket" # used by mirror worker
```

### Database schema (Prisma)
Entities: Coach, Player, Lesson, MediaAsset with enforced foreign keys and enums. Source: `prisma/schema.prisma`.

### API surface (App Router)
- `GET /api/players?coachId=&playerId=` — list players (filterable)
- `POST /api/players` — create player
- `GET /api/lessons?coachId=&playerId=` — list lessons with media
- `POST /api/lessons` — create lesson
- `GET /api/lessons/:lessonId` — lesson detail (coach, player, media)
- `POST /api/lessons/:lessonId/media` — register uploaded media
- `POST /api/mirror/enqueue` — accept Drive→object storage mirror jobs (stub queues)
- `GET /api/coaches` / `POST /api/coaches` — manage coaches
- `GET/POST /api/auth/tokens` — admin-only bearer token issuance (use header `x-admin-token: $ADMIN_API_TOKEN`)

Validation: `src/lib/validation.ts` (zod). DB access: `src/lib/prisma.ts`.

### Upload + mirroring flow (v1)
1) Client uploads to Google Drive using the coach’s Drive credentials; returns file id + web view link.  
2) Client calls `POST /api/lessons/:lessonId/media` to persist metadata.  
3) Backend enqueues `POST /api/mirror/enqueue` with `googleDriveFileId` (and media id).  
4) Worker (`npm run worker:mirror`, `scripts/mirror-worker.ts`) streams bytes from Drive to R2/S3 (stubbed), then updates `mirroredObjectStoreUrl`.  
5) Playback logic prefers `mirroredObjectStoreUrl`; falls back to Drive link.

### Seeds and workers
- Seed demo data: `npm run seed` (creates demo coach/players/lesson).
- Mirror worker (stub): `npm run worker:mirror` (marks missing mirrors with a constructed CDN URL).

### UI shells
- `/` — overview with quick navigation
- `/coach` — coach lesson timeline placeholder
- `/player` — player view placeholder
- `/lessons/[id]` — lesson detail with media registration form

### Notes
- Video cap enforced via validation (`durationSeconds` max 120).
- Keep uploads non-blocking; background mirroring only.
- Add auth + real queue wiring before production use.
