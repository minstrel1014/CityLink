# CityLink fictional course catalogue seed — review only

**These ten records are fictional CityLink demonstration data, not verified CityU courses.** The proposed SQL has not been run against Supabase. Do not execute it until the project owner reviews and approves the exact script.

The seed is in [`supabase/seed_citylink_fictional_courses.sql`](../supabase/seed_citylink_fictional_courses.sql). It inserts the ten courses requested for semester `2026-Fall`.

## Compatibility with the checked-in schema and client

The local `supabase/schema.sql` defines `public.courses` with required `code`, `title`, `department`, `credits`, and `semester` columns; `id` defaults to `gen_random_uuid()`, while `description` and `color` have defaults. Credits are `numeric(4,1)` and constrained to 0–99.9. The unique constraint is `(code, semester)`. The seed supplies all required fields, omits generated/defaulted fields, and uses only course color tokens handled by the current repository: `sage`, `peach`, `lavender`, `blue`, and `yellow`.

The schema accepts a semester as non-empty text up to 80 characters; it does not enforce a particular semester naming convention. The requested `2026-Fall` value fits this constraint. The repository treats semester as display/filter text and orders it lexicographically; it does not parse a structured semester value.

This review compares the script to the checked-in local schema and course repository only. The live Supabase table definition was not queried in this task; the user's prior reports of successful schema setup are not an independent live observation here.

## Rerun and conflict behavior

`ON CONFLICT (code, semester) DO NOTHING` relies on the local schema's unique constraint. Running the script again will not create duplicate rows for those code/semester pairs. If a row with the same pair already exists, its title, department, credits, description, color, ID, and timestamps remain unchanged. Other course rows are not updated or deleted. This is insert-only; it does not seed enrolments or create accounts.

Before use, confirm the intended Supabase project's live `public.courses` table has the expected columns and unique constraint. The course catalogue is managed by an authorized project owner; no browser privileges, RLS policies, grants, schema, or application code are changed by this script. No database operation has been performed by Manus.
