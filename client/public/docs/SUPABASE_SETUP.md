# CityLink Supabase setup

This guide describes a separately reviewed move from CityLink’s fictional browser sample repository to Supabase. It does **not** connect CityLink to CityU, Canvas, an institutional directory, SSO, an email roster, an LMS, or any real student record.

When this guide is published as an in-app downloadable document, its database download is the sibling file [`schema.sql`](schema.sql). In this repository, the maintained filesystem source is `supabase/schema.sql` at the repository root; copy that file beside the downloadable guide when publishing it under `client/public/docs`.

## Current app contract

The baseline models the shapes currently defined in `client/src/data/sampleData.ts`:

- `Course` maps to `courses`: `id`, `code`, `title`, `department`, `credits`, `semester`, `description`, and `color`.
- `Student` maps to `profiles`: `id` is the Supabase Auth UUID; `studentId` maps to `student_id`; `name` maps to `display_name`; and the other textual fields map directly. `year` is always an integer from **1 through 6**.
- `Student.status` is exactly `GroupStatus`: `open`, `considering`, or `full`. The database defaults it to `open` and rejects any other status.
- `Student.avatar` is an initials string in the current UI, not a photo URL. `Shared.tsx` renders it as text inside a `<span>`.
- `Enrolment` maps to `enrolments`: `studentId` is the Auth UUID in `student_id`, and `courseId` is `course_id`.
- `Invitation` maps to `invitations`: `senderId`, `recipientId`, `courseId`, and `createdAt` use snake_case columns. Valid invitation statuses are `pending`, `accepted`, `declined`, and `cancelled`.

The current app remains a browser `localStorage` demo until an implementation deliberately replaces a slice. Its demo auth, registration, and password-reset messages do not create Supabase Auth accounts or send reset email. Chat is incomplete and has no table in this proposal.

## Do not connect the sample app by only setting keys

Adding `VITE_SUPABASE_URL` and a publishable key does **not** make the current app compatible with Supabase. Before a connected repository or UI ships, obtain the current authenticated user with `supabase.auth.getUser()` and use `auth.user.id` as the one identity source.

Replace **every** runtime and test selector that currently uses `DEMO_USER_ID`; do not leave a connected code path importing that constant. At the time of writing, this includes:

- `client/src/data/repository.ts`, including `getStudents`, `getEnrolments`, invitation list/send/respond checks, profile ownership, and `getClassmates`.
- `client/src/data/AppContext.tsx`, especially the `me: students.find(...)` selector.
- `client/src/components/citylink/Shared.tsx`, including incoming invitation counts, course membership/roster calculations, and `InviteButton` pair lookups.
- `client/src/pages/citylink/Dashboard.tsx`, `Classmates.tsx`, and `Workspace.tsx`, which all select enrolments, invitations, or profiles for the sample identity.
- `client/src/data/repository.test.ts` and any replacement repository tests.
- `client/src/data/sampleData.ts` if the demo fixture is removed rather than maintained as a wholly separate, disconnected demo mode.

Pass `currentUserId` into repository helpers, or use `me.id` only after `me` was resolved from that Auth UUID. In particular, make `getClassmates` exclude the supplied authenticated ID instead of a module constant. `AppContext` must resolve `me` with `students.find(student => student.id === auth.user.id)` and fail cleanly if it is missing.

The Supabase `getStudents` implementation must return the signed-in user **as well as** visible peers. Do not filter the signed-in user from the profile query: the self row is necessary to populate `me`, profile editing, and identity-aware UI selectors. The RLS policy below explicitly permits that self row.

A demo-only `DEMO_USER_ID` can exist in an isolated fixture that is never used by the Supabase path, but it must not drive any connected repository, context, page, component, or test assertion.

## Security model

The schema chooses an **authenticated-only fictional demo catalog**. Signed-out visitors have no database access. Signed-in users can read all fictional courses, but can read a profile only when it is their own or they share at least one enrolment with that profile.

A direct `select` on `enrolments` remains deliberately narrow: a user can read only their own rows. That policy is not enough to populate classmates, so the schema adds the intentionally small RPC `public.visible_course_enrolments()`. It is a `SECURITY DEFINER` function with an empty `search_path`, schema-qualified table references, an authenticated-only execute grant, and returns only `student_id` and `course_id` for courses in which `auth.uid()` is enrolled. It exposes neither enrolment timestamps nor all-campus rosters.

The `private` schema is not an API schema and must not be added to Supabase’s exposed schemas list. It contains internal membership and recipient-availability helpers used by RLS and triggers. The roster RPC is deliberately in `public` because it is the narrow, intended client RPC surface.

Invitation access is restricted to sender and recipient. A browser insert must have `sender_id = auth.uid()`, start as `pending`, target someone else, prove both people are enrolled in the selected course, and target a recipient whose profile is `open` or `considering`. The last rule is checked by both RLS and a server-side trigger helper, so a recipient whose status is `full` cannot receive a new invitation through a direct database request. A profile owner may still update their own profile, including a valid status, under the own-row update policy.

For invitations, **active** means `pending` **or** `accepted`, matching `repository.ts`. The partial unique index prevents a same-direction or reverse-direction active pair for the same course. `declined` and `cancelled` are terminal and no longer block a later invitation.

The database enforces this state machine rather than trusting buttons:

```text
pending --recipient--> accepted
pending --recipient--> declined
pending --sender-----> cancelled
```

RLS permits only those callers and directions. A `BEFORE INSERT OR UPDATE` trigger repeats membership and recipient-availability checks, overwrites browser-supplied identifiers and timestamps on creation, makes sender, recipient, course, ID, and creation time immutable, and makes terminal states final. The `SECURITY DEFINER` helpers use an empty `search_path`, following Supabase’s documented precautions for definer functions. [2]

## 1. Create the project and apply the schema

Create a new Supabase project. In **Authentication**, choose the real sign-in method and redirect URLs before wiring the app. For a fictional demonstration, email/password is sufficient. Real registration and reset flows still require intentional Auth configuration and appropriate mail setup before production.

Open the project’s **SQL Editor**, paste the complete contents of the maintained `supabase/schema.sql`, and run it as the project owner. In a Supabase CLI workflow, copy the reviewed baseline into a new timestamped file under `supabase/migrations/` and apply it through normal migration review with `supabase db push`. Do not point the starter’s existing Drizzle migration process at this Supabase database by accident.

The schema creates a profile automatically after each new `auth.users` row. `profiles.id` references `auth.users(id)` with `ON DELETE CASCADE`, the supported pattern for application-owned user data. Supabase’s Auth schema is not exposed through the generated API, so clients work through `public.profiles` and RLS rather than querying `auth.users`. [3]

If Auth users already existed before applying the schema, backfill their profile shells once in the SQL Editor:

```sql
insert into public.profiles (id)
select id
from auth.users
on conflict (id) do nothing;
```

This is a reviewed baseline, not a claim that it has been applied or live-tested in a particular Supabase project. Apply it to a development project and run the policy tests in the rollout section before relying on it.

## 2. Create and seed fictional demo identities

Rows in `profiles` must correspond to real Supabase Auth UUIDs. Do not invent UUIDs in a seed file and do not insert directly into `auth.users` with application SQL. In the Supabase Dashboard, create confirmed demo-only Auth users with clearly fictional `.test` email addresses:

- `alex.wong.demo@example.test`
- `chloe.chan.demo@example.test`
- `ethan.lee.demo@example.test`

The Auth trigger creates each profile shell. Then run the following SQL as an administrator. It resolves IDs from those Auth users, so every profile and enrolment is tied to an authenticated identity. The profiles, statuses, colors, courses, and course membership align with the current CityLink samples: Alex Wong, Chloe Chan, and Ethan Lee; `IS3100`; and `IS2200`.

```sql
-- 1. Enrich Auth-created profile shells. These are fictional demo records.
with demo_people (email, student_id, display_name, major, year, bio, skills, status, avatar_url, color) as (
  values
    ('alex.wong.demo@example.test',  'DEMO10001', 'Alex Wong',  'Information Systems', 3::smallint,
     'An IS student who enjoys turning everyday problems into thoughtful digital experiences. Looking for a team that communicates openly and likes to build things.',
     array['UI/UX design', 'Python', 'Project planning']::text[], 'open', null::text, 'sage'),
    ('chloe.chan.demo@example.test', 'DEMO10002', 'Chloe Chan', 'Information Systems', 3::smallint,
     'I love the space where technology meets people. I usually take the lead on user research and interface design. Happy to brainstorm over coffee and keep our project moving.',
     array['Figma', 'User research', 'HTML & CSS']::text[], 'open', null::text, 'peach'),
    ('ethan.lee.demo@example.test',  'DEMO10003', 'Ethan Lee',  'Computer Science', 2::smallint,
     'Curious developer with a soft spot for clean code. I enjoy prototyping, solving tricky problems and learning from teammates with different perspectives.',
     array['React', 'TypeScript', 'Python']::text[], 'open', null::text, 'blue')
)
insert into public.profiles (
  id, student_id, display_name, major, year, bio, skills, status, avatar_url, color
)
select u.id, p.student_id, p.display_name, p.major, p.year, p.bio, p.skills, p.status, p.avatar_url, p.color
from demo_people p
join auth.users u on u.email = p.email
on conflict (id) do update set
  student_id = excluded.student_id,
  display_name = excluded.display_name,
  major = excluded.major,
  year = excluded.year,
  bio = excluded.bio,
  skills = excluded.skills,
  status = excluded.status,
  avatar_url = excluded.avatar_url,
  color = excluded.color,
  updated_at = now();

-- 2. Seed the CityLink sample course records. Color tokens match the app CSS.
insert into public.courses (
  code, title, department, credits, semester, description, color
)
values
  ('IS3100', 'Business Application Development', 'Information Systems', 3.0,
   'Semester A · 2026/27',
   'Turn business ideas into useful applications. Work together to design, build and present a working prototype.',
   'sage'),
  ('IS2200', 'Business Programming', 'Information Systems', 3.0,
   'Semester A · 2026/27',
   'Build a foundation in programming and solve practical business problems with Python.',
   'peach')
on conflict (code, semester) do update set
  title = excluded.title,
  department = excluded.department,
  credits = excluded.credits,
  description = excluded.description,
  color = excluded.color;

-- 3. Enrol only those authenticated fictional users. No client-side insert.
with user_map as (
  select id, email
  from auth.users
  where email in (
    'alex.wong.demo@example.test',
    'chloe.chan.demo@example.test',
    'ethan.lee.demo@example.test'
  )
), course_map as (
  select id, code
  from public.courses
  where semester = 'Semester A · 2026/27'
), memberships (email, code) as (
  values
    ('alex.wong.demo@example.test',  'IS3100'),
    ('chloe.chan.demo@example.test', 'IS3100'),
    ('ethan.lee.demo@example.test',  'IS3100'),
    ('alex.wong.demo@example.test',  'IS2200'),
    ('ethan.lee.demo@example.test',  'IS2200')
)
insert into public.enrolments (student_id, course_id)
select u.id, c.id
from memberships m
join user_map u on u.email = m.email
join course_map c on c.code = m.code
on conflict (student_id, course_id) do nothing;
```

Do not seed invitations with privileged SQL unless a migration specifically tests invitation behavior. Sign in as one of these fictional users and create an invitation through the client mutation below. That exercises the same RLS, shared-course, full-recipient, active-pair, and transition checks used by the app.

## 3. Configure the browser client safely

In the future implementation, add `@supabase/supabase-js` and define local-only environment variables. Do not commit a populated `.env.local`.

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
```

A Vite variable prefixed `VITE_` is intentionally bundled into the browser. A **publishable** key is designed for a browser or mobile app and is not a user credential; a signed-in user is identified separately by their Auth JWT. The key is safe to expose only because RLS and grants restrict what it can reach. [4]

Never place a `sb_secret_...` secret key or legacy `service_role` key in `VITE_*`, source code, `localStorage`, a client request, or a browser build. Those elevated keys bypass RLS and belong only in a developer-controlled server or admin job. [4]

A future client module can be as small as:

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
```

The existing app code is intentionally not modified by this guide. Add the dependency, environment types, authenticated-session handling, and client module in a separate implementation change.

## 4. Replace the sample repository with real reads and writes

Keep the UI types, but map database snake_case to the current camelCase shapes at the repository boundary. Do not confuse `profiles.id` (the Auth UUID used for ownership and relationships) with `profiles.student_id` (the fictional display student number).

The current `Avatar` component displays `student.avatar` as text. Do **not** map `avatar_url` into that property: it would render a URL as initials. Derive initials from `display_name` instead. The schema keeps `avatar_url` reserved, but photos require a future, explicitly reviewed UI addition: image storage/upload rules, URL validation, and an `Avatar` implementation that safely renders an image with an initials fallback. The current application has none of that functionality.

```ts
function initialsFromDisplayName(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.slice(0, 1).toUpperCase())
    .join('')

  return initials || '?'
}

const toCourse = (row: any): Course => ({
  id: row.id,
  code: row.code,
  title: row.title,
  department: row.department,
  credits: Number(row.credits),
  semester: row.semester,
  description: row.description,
  color: row.color,
})

const toStudent = (row: any): Student => ({
  id: row.id,
  studentId: row.student_id ?? '',
  name: row.display_name,
  major: row.major ?? '',
  year: Number(row.year),
  bio: row.bio,
  skills: row.skills ?? [],
  status: row.status,
  avatar: initialsFromDisplayName(row.display_name),
  color: row.color,
})

const toEnrolment = (row: any): Enrolment => ({
  studentId: row.student_id,
  courseId: row.course_id,
})

const toInvitation = (row: any): Invitation => ({
  id: row.id,
  senderId: row.sender_id,
  recipientId: row.recipient_id,
  courseId: row.course_id,
  status: row.status,
  createdAt: row.created_at,
})
```

At app start, obtain the authenticated user, then rehydrate from the database. The profile query returns the caller’s self profile plus shared-course peers; it must populate `students`, including `me`. `visible_course_enrolments` supplies the minimal roster identifier list needed by `getClassmates` without weakening the direct-table own-row policy.

```ts
export async function loadCityLinkState() {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error('A signed-in Supabase user is required')

  const [profilesResult, coursesResult, enrolmentsResult, invitationsResult] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, student_id, display_name, major, year, bio, skills, status, color')
        .order('display_name'),
      supabase
        .from('courses')
        .select('id, code, title, department, credits, semester, description, color')
        .order('semester', { ascending: false })
        .order('code'),
      supabase.rpc('visible_course_enrolments'),
      supabase
        .from('invitations')
        .select('id, sender_id, recipient_id, course_id, status, created_at')
        .order('created_at', { ascending: false }),
    ])

  for (const result of [profilesResult, coursesResult, enrolmentsResult, invitationsResult]) {
    if (result.error) throw result.error
  }

  const students = (profilesResult.data ?? []).map(toStudent)
  const me = students.find(student => student.id === auth.user.id)
  if (!me) throw new Error('The authenticated profile is unavailable')

  return {
    currentUserId: auth.user.id,
    students, // Includes `me`; do not filter it out in getStudents.
    courses: (coursesResult.data ?? []).map(toCourse),
    enrolments: (enrolmentsResult.data ?? []).map(toEnrolment),
    invitations: (invitationsResult.data ?? []).map(toInvitation),
  }
}
```

The course catalog is visible to all signed-in users, but roster rows are available only for courses the current user is enrolled in. Therefore, render a classmate/peer directory only after confirming the current user is enrolled in that course. It is also acceptable to show the catalog card for a non-enrolled course, but it must clearly say that no roster is available rather than presenting an empty roster as a true zero-person class. Never call the roster RPC to build a directory for a course the user does not attend.

Supabase JavaScript mutations do not return inserted rows by default. Chain `.select()` and use `.single()` for the one invitation the UI needs to render. [5]

```ts
export async function createInvitation(input: {
  recipientId: string
  courseId: string
}): Promise<Invitation> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error('Sign in before sending an invitation')

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      sender_id: auth.user.id,
      recipient_id: input.recipientId,
      course_id: input.courseId,
      // status, id, and timestamps are intentionally not supplied by the UI.
    })
    .select('id, sender_id, recipient_id, course_id, status, created_at')
    .single()

  if (error) throw error
  return toInvitation(data)
}
```

Do not rely on an `InviteButton` being disabled for `full` profiles or on a client-side duplicate scan. The database rejects a new invitation to a `full` recipient and the active-pair index rejects duplicate `pending` or `accepted` pairs, including reverse-direction attempts.

For an actual accept, decline, or cancel button, update the status and use the returned row to replace local state. A caller who attempts the wrong transition receives a database error even if a UI control is accidentally enabled.

```ts
export async function transitionInvitation(
  invitationId: string,
  status: 'accepted' | 'declined' | 'cancelled',
): Promise<Invitation> {
  const { data, error } = await supabase
    .from('invitations')
    .update({ status })
    .eq('id', invitationId)
    .select('id, sender_id, recipient_id, course_id, status, created_at')
    .single()

  if (error) throw error
  return toInvitation(data)
}
```

Profile editing is a real remote write only after Auth is enabled. The policy permits the signed-in user to update only their own row. Keep photo fields out of the current mutation because the current UI does not support photos.

```ts
const { data, error } = await supabase
  .from('profiles')
  .update({ display_name, major, year, bio, skills, status, color })
  .eq('id', currentUserId)
  .select('id, student_id, display_name, major, year, bio, skills, status, color')
  .single()

if (error) throw error
const updatedStudent = toStudent(data)
```

There is intentionally no client `insert` into `enrolments`, no client course administration, and no client use of a secret key. Use a controlled administrator workflow, SQL import, or server-side admin tool for those operations.

## 5. Rollout and verification

1. Apply the schema to a development Supabase project and create the fictional Auth users and seed catalog above.
2. Implement actual Supabase sign-in and replace all `DEMO_USER_ID` selectors in the same reviewed change. Until then, leave demo auth/register/reset copy clearly informational. A real user must be signed in before RLS-backed reads or invitation writes can work.
3. Replace one repository slice at a time: authenticated initial rehydration, then profile update, then invitation creation and transitions. Reload after each successful mutation or merge the exact returned row into state.
4. Make the repository’s profile list include the current user; make the enrolment list use `rpc('visible_course_enrolments')`; and pass the authenticated UUID through every classmate, course, invitation, and profile selector.
5. Treat existing browser `localStorage` as untrusted demo data. Do not bulk-upload it from a visitor’s browser or infer other users’ Auth IDs. If a fictional dataset must survive, an administrator should map fictional people to deliberately created Auth users and import it using the SQL pattern above.
6. Once a slice is verified against Supabase, remove its `localStorage` fallback. Keep localStorage only for non-authoritative UI preferences if needed; it must not become a second profile or invitation database.
7. Test the policy boundary with at least two signed-in demo users. Confirm that a user can read their own profile and shared-course peers, gets roster IDs only for their enrolled courses, cannot directly read another user’s enrolment row, cannot invite a non-peer or self, cannot invite a `full` recipient, cannot create a second active (`pending` or `accepted`) pair in either direction, cannot make a recipient cancel, and cannot alter a terminal invitation.

For production readiness, additionally add typed generated database definitions, automated RLS allow/deny tests, error reporting that does not disclose private data, and a deliberate retention/deletion policy. Supabase recommends testing each table’s permitted and denied operations rather than assuming an RLS policy is correct. [1]

## References

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"

[2]: https://supabase.com/docs/guides/database/functions "Supabase Database Functions"

[3]: https://supabase.com/docs/guides/auth/managing-user-data "Supabase User Management"

[4]: https://supabase.com/docs/guides/getting-started/api-keys "Supabase API Keys"

[5]: https://supabase.com/docs/reference/javascript/insert "Supabase JavaScript Insert"
