ALTER TABLE public.users
  ALTER COLUMN is_admin SET DEFAULT false;

NOTIFY pgrst, 'reload schema';
