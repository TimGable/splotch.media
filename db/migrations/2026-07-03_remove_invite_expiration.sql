ALTER TABLE invites
  DROP COLUMN IF EXISTS expires_at;

ALTER TYPE invite_status RENAME TO invite_status_old;

CREATE TYPE invite_status AS ENUM ('created', 'sent', 'used', 'revoked');

ALTER TABLE invites
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE invite_status
    USING (
      CASE
        WHEN status::text = 'expired' THEN 'revoked'
        ELSE status::text
      END
    )::invite_status,
  ALTER COLUMN status SET DEFAULT 'created';

DROP TYPE invite_status_old;
