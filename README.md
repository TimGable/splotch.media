# splotch

splotch is a community based, independently created/operated multimedia archive/streaming platform. All are welcome to use the service for no cost. 

## Overview

The application gives artists a focused archive for presenting their work without the noise of a traditional social feed. Creators can upload single tracks, multi-track releases, images, and videos, manage profile details, follow other artists; like and comment on public media, and share clean public links for individual posts.

Administrative tools support invite request review, moderator access, and community announcements. Public pages are server-rendered where possible so artist profiles and media pages load quickly and remain easy to share.

## Core Features

- Authenticated creator dashboard with profile setup and account management
- Music, visual art, and video upload workflows
- Multi-track music release support for singles, EPs, and albums
- Public artist profiles with shareable media URLs
- Follow, like, comment, and mention interactions
- Personalized home feed with discovery fallback
- Admin and moderator invite request management
- Community announcement board
- Responsive interface built with React, Next.js, Tailwind CSS, and Radix UI primitives

## Technical Highlights

- **Next.js App Router:** route handlers provide the application API while server components load public profile and media data.
- **Supabase integration:** authentication, relational data, storage, and signed media access are handled through typed helper modules.
- **Direct media uploads:** large files upload to storage through signed upload URLs instead of passing through the application server.
- **Media response shaping:** shared library functions normalize database rows into UI-friendly payloads with social counts, cover art, previews, and release metadata.
- **Progressive UI behavior:** animated view transitions, persistent audio playback, infinite feed loading, and optimistic social updates keep the experience responsive.
- **Database-first design:** schema and migrations live in `db/` so the data model can be reviewed alongside the application code.

## Project Structure

```text
app/                  Next.js routes, pages, API handlers, and React components
app/components/       Dashboard, public pages, upload flow, feed, and UI primitives
app/api/              Route handlers for auth, media, profile, feed, admin, and social actions
lib/                  Shared Supabase, upload, notification, routing, and media helpers
db/                   SQL schema and migrations
docs/                 Architecture notes
styles/               Tailwind and global styling
```

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000` in a browser.

This project expects a configured Supabase project and local environment file for authentication, storage, and email delivery. Sensitive deployment values are intentionally not documented in this repository. Configure them through your local environment and hosting provider settings.

## Database

The database schema and migration history are included for review:

- `db/schema.sql`
- `db/migrations/`

For a fresh environment, apply the base schema first, then run the migrations in chronological order.

## Quality Checks

Run linting before submitting changes:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

## Portfolio Notes

This repository demonstrates a production-style React and Next.js application with server-side data loading, authenticated API routes, media storage workflows, reusable UI components, and a relational database model. The code favors small helper modules for repeated domain logic so route handlers and components stay focused on user-facing behavior.
