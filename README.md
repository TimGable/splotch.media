This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Local Postgres

Start a local PostgreSQL instance with Docker:

```bash
docker compose up -d
```

Default connection values:

- Host: `localhost`
- Port: `5432`
- Database: `splotch`
- User: `oma_app`
- Password: `oma_dev_password`

The initial schema is loaded from [`db/schema.sql`](./db/schema.sql) on first container initialization.

Stop database:

```bash
docker compose down
```

Reset database (destroys local data volume and re-runs schema init):

```bash
docker compose down -v
docker compose up -d
```

## Supabase Setup (Cloud)

This project is configured to use Supabase for cloud database access via Next.js route handlers.

1. Copy env template and fill values:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose in client code)
- `APP_BASE_URL` (your canonical deployed URL, `https://splotchmedia.com`; used in emails and `/create-password` redirects)
- `INVITE_EMAIL_ACTION_SECRET` (optional; secret for one-click owner email approve/deny buttons)
- `RESEND_API_KEY` (optional; enables admin email notifications)
- `FROM_EMAIL` (optional; sender identity for app emails)
- `NOTIFY_OWNER_EMAIL` (optional; receives invite request notifications)

On Vercel, set `APP_BASE_URL=https://splotchmedia.com` in Project Settings -> Environment Variables for Production. If it is omitted, the app falls back to Vercel's deployment URL environment variables, then to `http://localhost:3000` for local development.

2. In Supabase SQL Editor, run schema:

- [`db/schema.sql`](./db/schema.sql)

3. Start app:

```bash
npm run dev
```

### API routes added

- `POST /api/invite-requests`
- `GET /api/profile` (requires `Authorization: Bearer <access_token>`)
- `PATCH /api/profile` (requires `Authorization: Bearer <access_token>`)
- `GET /api/admin/invite-requests` (admin-only; requires `Authorization: Bearer <access_token>`)
- `POST /api/admin/invite-requests/:requestId/approve` (admin-only; sends Supabase invite email)
- `POST /api/admin/invite-requests/:requestId/resend-link` (admin-only; resends password-setup link)
- `POST /api/admin/invite-requests/:requestId/deny` (admin-only; requires `{ "reason": "..." }`, stores note, emails requester)
- `DELETE /api/admin/invite-requests/:requestId` (admin-only; deletes previously handled request)
- `GET /api/admin/invite-requests/email-action?requestId=...&action=approve|deny&token=...` (owner email quick action)

To grant your owner account admin access, set `is_admin = true` on your row in `public.users`.

Example in Supabase SQL Editor:

```sql
update public.users
set is_admin = true
where email = 'your-owner-email@example.com';
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
