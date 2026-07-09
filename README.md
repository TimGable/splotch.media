# splotch

splotch is a community based, independently created/operated multimedia archive/streaming platform. All are welcome to request use the service at no cost (currently).  

## Overview

The application gives artists an archive for presenting/preserving their work without the annoyances that come along with hosting their creative projects on large platforms. Creators can upload music (singles, EP's, and albums), images (traditional/digital art, photography, graphic design projects, even architectural designs), and videos (creative projects, music videos, edits)

Administrative tools support invite request review, moderator access such as removing harmful content or comments, and community announcements to help the userbase stay engaged and suggest changes/new features. Public pages are server-rendered where possible so artist profiles and media pages load quickly and remain easy to share.

## Core Features

- Authenticated creator dashboard with profile setup and account management
- Music, visual art, and video upload workflows
- Multi-track music release support for singles, EPs, and albums
- Public artist profiles with shareable media URLs
- Follow, like, comment, and mention interactions
- Personalized home feed with discovery fallback
- Admin and moderator invite request management
- Community announcement board
- User-to-user messaging/conversation deletion. 
- Responsive interface built with React, Next.js, Tailwind CSS, and Radix UI.

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
