# What is actually live — and it is not on Launch

Coordinator investigation, 2026-11-23 13:47, answering Adam's request to name the live build. Method: HTTP fetches of the only known public entry point plus one read of its bundle, no credentials extracted, nothing reused.

## The finding

**No build is deployed against CityLink Launch.** The only live deployment is bound to the **Prototype**, and it predates the capacity work entirely.

| Fact                                  | Value                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Public entry point                    | `https://clinkdemo-z7jrfxui.manus.space`                                                                          |
| HTML                                  | 1,862 bytes, loads `/assets/index-VN34B96y.js` and `/api/platform/config.js`                                      |
| Live bundle                           | `index-VN34B96y.js`, 883,499 bytes, SHA-256 `64688e23a00a8764…`                                                   |
| Supabase target baked into the bundle | `wkzclgmhrtecnpexfesr` — the **Prototype**, not Launch                                                            |
| Creation RPC called                   | `create_group_and_invite` with `{p_course_id, p_recipient_id, p_name}` — **three arguments**                      |
| Capacity markers in the bundle        | `max_members` 0, `group_capacity_upgrade_required` 0, `list_group_recruitment_posts_capacity` 0, `version.json` 0 |
| `/version.json`                       | **404** — no build marker is served, so the deployed identity is only knowable from the bundle hash               |
| `/api/platform/config.js`             | 27 KB served, contains no Supabase URL — the ref is compiled into the bundle, not injected at runtime             |

So the live deployment is the pre-capacity generation: three-argument creation, no capacity reads, no upgrade message, no build marker. That is consistent with the prototype bundle handed to the professor, and it is exactly why the earlier analysis concluded that applying the blob to the Prototype would break group creation with a token that build cannot interpret.

## What this means for F22

F22 is confirmed and now has a concrete shape. Launch's only creation RPC takes **two** arguments; `main`'s client takes **three**; the deployed demo build also takes three, but it points at the Prototype, which still has the three-argument function. Nothing anywhere is both capacity-aware and pointed at Launch.

Consequences:

1. Deploying `main` to Launch would not work: `main` calls three arguments and Launch has two.
2. Deploying the live demo build to Launch would not work either, for the same reason.
3. The only client that can work against Launch after the release is the capacity-aware one — PR #37 head `344c1058…`, which calls `p_max_members` and the `*_capacity` reads.

## The deployment gap nobody has closed

There is no hosting target for Launch. The existing site is bound to the Prototype with the ref compiled in, and no `VITE_SUPABASE_URL` / publishable key pair for Launch has ever been recorded. A release therefore needs two things that do not exist yet: a place to deploy, and the browser-safe Launch configuration to build with. Neither is a technical detail — both are decisions Adam has to make, and the second one involves handling a publishable key without exposing anything secret.

## Boundary

Two HTTP GETs against a public site and one bundle read, to identify a build. No key, token or cookie was extracted, printed or stored; no configuration was reused; no deployment, publication or configuration change was made.
