## Baseline Video

Coaching app MVP (Next.js App Router + Prisma/Postgres + Supabase Auth).

### Local setup
- `npm install`
- Copy `env.example` → `.env` and fill values

### Supabase (recommended setup)
Use **two connection strings**:
- **`DATABASE_URL`**: Supabase Transaction Pooler (runtime / serverless)
- **`DIRECT_URL`**: Supabase Direct Connection (migrations)

To avoid clobbering an existing `public` schema, append `?schema=baseline` to both URLs.

### Google Drive uploads (required for in-app upload)
Supabase Google OAuth must request the Drive scope:
- In Supabase: **Authentication → Providers → Google**
  - Add additional scope: `https://www.googleapis.com/auth/drive.file`
  - Save, then **sign out and sign in again** to re-consent.

### Migrations
Create/apply migrations locally (dev):
- `npm run prisma:migrate`

Apply migrations in production (CI/Vercel manual step):
- `npm run prisma:deploy`

### Run
- `npm run dev`
