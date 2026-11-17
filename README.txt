GAULOIS AERION U12 PARENT PORTAL — SUPABASE VERSION

This project is a Vite app. Netlify must build it (do not deploy the source folder as a plain static HTML page).

NETLIFY BUILD SETTINGS
- Build command: npm run build
- Publish directory: dist
- Environment variables:
  VITE_SUPABASE_URL = your Supabase Project URL
  VITE_SUPABASE_ANON_KEY = your Supabase Publishable Key

DATABASE EXPECTATIONS
Uses the existing public tables: activities, parent_players, players, profiles, responses.
It expects the existing columns and RLS policies described during setup.

IMPORTANT ACCOUNT SETUP
1. Create/confirm a coach/admin user in Supabase Authentication > Users.
2. Ensure that user's public.profiles row has role 'admin' or 'coach'.
3. Parents can create their own accounts in the portal. Their profile is created with role 'parent'.
4. A coach/admin must link each parent account to the correct player by inserting a row in public.parent_players (parent_id = auth user UUID, player_id = player UUID). The portal displays a clear message until a child is linked.
5. Existing activity_type values are lowercase 'training' or 'match'; response answer values are lowercase 'yes', 'no', or 'unsure'.

SECURITY
Only use the Supabase Publishable Key in VITE_SUPABASE_ANON_KEY. Never put a secret/service_role key in a browser app. RLS must remain enabled on all tables.

NOTE
The portal intentionally does not create or modify database tables or policies. It uses the existing schema. Test with one parent account and one linked player before inviting all families.
