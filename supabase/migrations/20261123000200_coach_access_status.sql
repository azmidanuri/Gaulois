-- Gaulois Aerion Portal
-- Allow administrators to deactivate and restore coach portal access.
-- Existing accounts remain active unless an administrator changes their status.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL;
