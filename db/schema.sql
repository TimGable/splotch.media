-- Splotch: initial PostgreSQL schema
-- This keeps app data in Postgres and stores binary media in object storage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
    CREATE TYPE media_type AS ENUM ('music', 'visual', 'video');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_level') THEN
    CREATE TYPE visibility_level AS ENUM ('private', 'invite_only', 'public', 'unlisted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'publish_state') THEN
    CREATE TYPE publish_state AS ENUM ('draft', 'processing', 'ready', 'failed', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'music_release_type') THEN
    CREATE TYPE music_release_type AS ENUM ('single', 'ep', 'album');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_request_status') THEN
    CREATE TYPE invite_request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE invite_status AS ENUM ('created', 'sent', 'used', 'revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_role') THEN
    CREATE TYPE asset_role AS ENUM (
      'avatar',
      'original',
      'stream_master',
      'stream_variant',
      'thumbnail',
      'poster',
      'waveform',
      'subtitle',
      'download'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE, -- Link to auth provider record (e.g. Supabase auth.users.id)
  email CITEXT UNIQUE NOT NULL,
  password_change_required BOOLEAN NOT NULL DEFAULT true,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_moderator BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username CITEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_asset_id UUID, -- FK added after media_assets exists
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,32}$')
);

CREATE TABLE IF NOT EXISTS profile_categories (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category media_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS invite_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL,
  message TEXT NOT NULL,
  status invite_request_status NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_requests_status_created
  ON invite_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- random token shown in invite URL
  email CITEXT,
  status invite_status NOT NULL DEFAULT 'created',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  request_id UUID REFERENCES invite_requests(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  used_by_user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_email_status
  ON invites (email, status);

CREATE TABLE IF NOT EXISTS follows (
  follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, artist_user_id),
  CONSTRAINT no_self_follow CHECK (follower_user_id <> artist_user_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_artist ON follows (artist_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_kind media_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_asset_id UUID, -- FK added after media_assets exists
  published_at TIMESTAMPTZ,
  visibility visibility_level NOT NULL DEFAULT 'invite_only',
  state publish_state NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_collections_owner ON media_collections (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_collections_discovery ON media_collections (media_kind, visibility, state, published_at DESC);

CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_kind media_type NOT NULL,
  collection_id UUID REFERENCES media_collections(id) ON DELETE SET NULL,
  music_release_type music_release_type,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  primary_asset_id UUID, -- FK added after media_assets exists
  duration_ms INTEGER,
  visibility visibility_level NOT NULL DEFAULT 'invite_only',
  state publish_state NOT NULL DEFAULT 'processing',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duration_nonnegative CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_media_items_owner ON media_items (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_items_feed ON media_items (visibility, state, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_items_collection ON media_items (collection_id, created_at);

CREATE TABLE IF NOT EXISTS music_track_details (
  media_item_id UUID PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
  release_track_number INTEGER,
  disc_number INTEGER NOT NULL DEFAULT 1,
  bpm INTEGER,
  musical_key TEXT,
  isrc TEXT,
  explicit_lyrics BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT release_track_positive CHECK (release_track_number IS NULL OR release_track_number > 0),
  CONSTRAINT disc_positive CHECK (disc_number > 0),
  CONSTRAINT bpm_positive CHECK (bpm IS NULL OR bpm > 0)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_item_id UUID REFERENCES media_items(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES media_collections(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role asset_role NOT NULL,
  storage_provider TEXT NOT NULL, -- e.g. s3, r2, gcs, supabase
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT NOT NULL,
  codec TEXT,
  file_size_bytes BIGINT NOT NULL,
  checksum_sha256 TEXT,
  width_px INTEGER,
  height_px INTEGER,
  duration_ms INTEGER,
  bitrate_kbps INTEGER,
  language_code TEXT,
  is_lossless BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT file_size_positive CHECK (file_size_bytes > 0),
  CONSTRAINT width_nonnegative CHECK (width_px IS NULL OR width_px > 0),
  CONSTRAINT height_nonnegative CHECK (height_px IS NULL OR height_px > 0),
  CONSTRAINT duration_nonnegative_asset CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT belongs_to_item_or_collection CHECK (
    media_item_id IS NOT NULL OR collection_id IS NOT NULL OR role = 'avatar'
  ),
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_item ON media_assets (media_item_id, role);
CREATE INDEX IF NOT EXISTS idx_media_assets_collection ON media_assets (collection_id, role);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets (owner_user_id, created_at DESC);

ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_avatar_asset
  FOREIGN KEY (avatar_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE media_collections
  ADD CONSTRAINT fk_media_collections_cover_asset
  FOREIGN KEY (cover_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE media_items
  ADD CONSTRAINT fk_media_items_primary_asset
  FOREIGN KEY (primary_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS media_likes (
  media_item_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_item_id, user_id)
);

CREATE TABLE IF NOT EXISTS media_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_item_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES media_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_comments_item ON media_comments (media_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  media_item_id UUID REFERENCES media_items(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES media_comments(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (type IN ('follow', 'like', 'comment', 'mention'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (recipient_user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS message_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_conversation_participants (
  conversation_id UUID NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_participants_user
  ON message_conversation_participants (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_body_length CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender_created
  ON messages (sender_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_posts_created
  ON announcement_posts (created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_likes (
  announcement_post_id UUID NOT NULL REFERENCES announcement_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_post_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_post_id UUID NOT NULL REFERENCES announcement_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES announcement_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_comments_post
  ON announcement_comments (announcement_post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS play_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_item_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  watch_time_ms INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  source_context TEXT,
  CONSTRAINT watch_time_nonnegative CHECK (watch_time_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_play_events_media_time ON play_events (media_item_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_events_user_time ON play_events (user_id, played_at DESC);
