# CityLink Stage 4 enrolment permission review

**Status: the user reports that the SQL below was applied and the resulting grants, RLS policies, and permission checks were verified. This agent did not connect to Supabase or independently observe the live catalog; treat the applied/verified state as user-reported. No SQL was run by this agent. The frontend write gate is enabled following the user's instruction.**

## What was inspected

I inspected the repository's local `supabase/schema.sql`, the Supabase course/enrolment client boundary, and the project’s authenticated route. I could not inspect the live Supabase catalog: this session has no direct Supabase SQL/catalog connector, and the Webdev project uses its browser-side client rather than a privileged database connection. The user previously reported that the schema was applied and verified; that report is not a substitute for observing the current live policies.

The local schema declares:

- `public.courses` is readable by authenticated users (`SELECT` grant and an authenticated read policy using `true`). The browser has no course-administration write grant.
- `public.enrolments` has only `SELECT` granted to `authenticated`, plus the `users read own enrolments` policy (`student_id = auth.uid()`). The local schema intentionally has no browser `INSERT`, `DELETE`, or `UPDATE` policy/grant.
- `public.enrolments.student_id` references `public.profiles.id`; `course_id` references `public.courses.id`. Both foreign keys cascade on deletion. The composite primary key `(student_id, course_id)` prevents duplicate enrolment rows.
- `public.profiles` can be read by the owner and by authenticated peers who share a course, through the existing `private.shares_course_with` helper. Therefore, allowing self-enrolment can make the enrolling user discoverable to other members of that course. This is the accepted group-finding trade-off for the prototype, not strict profile privacy.

## User-reported live verification (not independently observed)

The user reports that post-application checks found: reading own enrolments, enrolling as oneself, and deleting one's own enrolment are allowed; UPDATE is denied; inserting for another student and directly setting `created_at` are denied. RLS is enabled on `profiles`, `courses`, and `enrolments`; the composite primary key and student/course foreign keys are present. `FORCE ROW LEVEL SECURITY` is false on those tables, which the user reports is acceptable for ordinary authenticated browser requests. These results are user-reported, not observed by this agent. Actual Account A/Account B write-isolation testing has not yet been performed.

## SQL reference (reported applied)

The user reports executing these statements after reviewing the live catalog and confirming the expected outcomes. This block is retained as an audit reference; do not rerun it blindly. The read-only queries below can be used for a later audit or re-verification.

```sql
grant insert (student_id, course_id)
  on table public.enrolments to authenticated;
grant delete on table public.enrolments to authenticated;

create policy "users add own course enrolment"
  on public.enrolments
  for insert
  to authenticated
  with check (student_id = (select auth.uid()));

create policy "users remove own course enrolment"
  on public.enrolments
  for delete
  to authenticated
  using (student_id = (select auth.uid()));
```

No `UPDATE` privilege or policy is proposed. `INSERT` is granted only for `student_id` and `course_id`; the defaulted `created_at` remains database-managed. PostgreSQL does not support column-level `DELETE` grants, so DELETE requires a table privilege and is limited to the owner's rows by the RLS policy. The insert check binds `student_id` to the authenticated UUID. Existing foreign keys require a real profile and course row; the composite primary key rejects duplicate user/course pairs. This design still lets an authenticated user select any existing course because the course catalog is visible to authenticated users; it does not prove CityU/Canvas registration.

## Read-only catalog queries for the project owner

These `SELECT` statements are safe for later audit or re-verification in the intended CityLink project. They do not change database state. The user reports that the permission checks and policy definitions matched expectations after applying the SQL; those results have not been independently observed here.

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('courses', 'enrolments', 'profiles')
order by tablename, policyname;
```

```sql
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('courses', 'enrolments')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

```sql
select
  table_name,
  column_name,
  grantee,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'enrolments'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, column_name, grantee, privilege_type;
```

```sql
select
  rel.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and rel.relname in ('courses', 'enrolments')
order by rel.relname, con.conname;
```

Before any policy change, compare the output with the proposed owner-only checks, confirm the foreign keys and unique key, and inspect any differently named policies that might already grant broader access. The app keeps its Add/Remove controls disabled until that review and separate approval are complete. The application does not verify course membership against university records.
