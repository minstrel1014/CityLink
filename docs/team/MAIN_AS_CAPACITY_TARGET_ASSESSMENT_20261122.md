# Can Main become the capacity target? — read-only assessment

Coordinator task `HeZwm7CA7Y3rDtYBounkVC`, 2026-11-22 22:23, answering Adam's 22:22 question: run the capacity changes on Main, swap the roles of Main and Test, and rename them so later operations are not confusing. This file records what is technically true and what it would cost. It records no decision and authorizes nothing.

## Three facts that decide the shape of the answer

**Project refs are immutable; only display names can change.** A Supabase project's `ref` (`pijslbchvstkoweslymr`, `wkzclgmhrtecnpexfesr`) cannot be renamed, and the professor's bundle has the Test ref baked into its executable package. Renaming the two projects in the dashboard changes the labels everyone reads, and nothing else: the professor keeps connecting to `wkzclgmhrtecnpexfesr` whatever it is called. A literal role swap — the demonstration moving to one ref while the capacity work moves to the other — is therefore impossible without repackaging the prototype, which is the advisor's option 三 and the most expensive of the three.

**Main is one migration behind the repository, and provably so.** Main's `create_group_and_invite` takes two arguments (`uuid,uuid`); Test's takes three (`uuid,uuid,text`), which is what the missing `stage6_people_page_naming` migration produces. The read-only ledger listing agrees: Main's seven rows stop at `stage6_chat_recruitment`, while Test's seven include `stage6_people_page_naming`. Because the function signature differs, this is not a bookkeeping gap that could be explained by a dashboard-applied migration — Main genuinely does not have that file applied. Any capacity migration reviewed against the repository's eight-file state would therefore find a missing prerequisite on Main and, correctly, fail closed.

**Main is nearly empty, but not empty.** Read-only counts: 2 rows in `auth.users`, 2 in `public.profiles`, 10 in `public.courses`, and 0 in `study_groups`, `group_memberships`, `group_invitations`, `group_join_requests`. So there is almost nothing to lose in terms of data, which is what makes the question reasonable. What there is to lose is the _reference_: Main is the database the launch is supposed to point at, and it currently carries no capacity objects at all.

## What running capacity on Main would actually require

In order: apply `20261118083000_stage6_people_page_naming.sql` to Main (which itself replaces the two-argument creation function with the three-argument one), then the reviewed capacity blob. Two schema changes on the launch database, neither reversible without a restore, and the first of them already breaks any old client that creates groups against Main — before capacity is even involved.

That coupling is the real problem, not the data. Capacity on Main means the launch site must already be running the new client, because the old client's creation call would either hit a changed signature or the fail-closed stub. The project's release gates deliberately require the client/schema rollout review and an approved compatibility decision _before_ a database reaches that state. Putting capacity on Main first inverts that order and turns the launch database into the experiment.

## Options, cheapest first

1. **Rename only (recommended, free, reversible, no schema change).** Rename the display names so the roles are unmistakable, for example Test → "CityLink Prototype (do not migrate)" and Main → "CityLink Launch (read-only until release)". The refs, the professor's bundle and every authorization stay exactly as they are. This is a dashboard action; the Supabase connector exposes no rename tool, so Adam does it himself.
2. **Keep the plan already recorded: a separate one-off capacity project.** Costs a decision on the free plan's two-active-project limit, and needs the eight checked-in files replayed plus a little seed data. It is the only arrangement in which the launch database is never the experiment.
3. **Local Supabase stack as the rehearsal target.** Free and unlimited, good for preflight and migration rehearsal, weak for signed-in multi-account evidence and useless for hosting-edge behaviour, so it cannot carry the final QA gate on its own.
4. **Apply capacity to Main now.** Cheapest in calendar time and the most expensive in risk: two migrations on the launch database, no undo without a restore, and the launch site must be on the new client before the change is safe. This is a legitimate end state — Main must eventually receive capacity — but it belongs at release, after the client rollout review, not as the rehearsal.

## Recommendation

Do not use Main as the rehearsal surface. Rename for clarity now, keep Test frozen as the demonstration runtime, and rehearse on either a new one-off project or a local stack. Main receives capacity once, at release, under a separate explicit decision that also names the client rollout it depends on.

## Boundary observed

Read-only catalog, ledger and aggregate-count queries against Main and Test only. No write, no migration, no application row content read (counts only), no credential output, no merge, deployment or publication. No project was created or renamed.
