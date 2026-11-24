/**
 * Display-side mirror of the database predicate `private.can_access_group_files`.
 *
 * This is **not** the authority. The server decides; every RPC re-checks the
 * predicate inside its own transaction. This module exists so the client does
 * not offer an "Analyse" button that the database will reject, and so the four
 * membership cases can be unit-tested without a database.
 *
 * The rule, per contract section 2: a caller may touch group files when there is
 * a session, the caller is an **active** member of the group, and the group is
 * not abandoned. Reusing `private.can_read_group_chat` would be wrong here,
 * because that predicate also admits `left` and `removed` members - the exact
 * regression this module pins down.
 */

export type GroupMembershipStatus = "active" | "left" | "removed" | "none";

export type GroupLifecycleStatus = "active" | "abandoned" | "archived";

export interface GroupAccessInput {
  hasSession: boolean;
  membership: GroupMembershipStatus;
  groupStatus: GroupLifecycleStatus;
}

export type GroupAccessDenial =
  | "group_files_no_permission"
  | "group_files_group_abandoned";

export type GroupAccessDecision =
  | { allowed: true; denial: null }
  | { allowed: false; denial: GroupAccessDenial };

export function decideGroupFileAccess(
  input: GroupAccessInput
): GroupAccessDecision {
  if (!input.hasSession) {
    return { allowed: false, denial: "group_files_no_permission" };
  }
  if (input.membership !== "active") {
    // `left` and `removed` land here on purpose. A former member can still read
    // chat history under the chat predicate; that must not extend to files.
    return { allowed: false, denial: "group_files_no_permission" };
  }
  if (input.groupStatus === "abandoned") {
    return { allowed: false, denial: "group_files_group_abandoned" };
  }
  return { allowed: true, denial: null };
}

/**
 * Whether the analysis affordance should be offered at all. A file whose
 * extraction failed stays downloadable, so this only gates the "Analyse"
 * action, never the download link.
 */
export function canOfferAnalysis(
  input: GroupAccessInput & { analysisStatus: string }
): boolean {
  if (!decideGroupFileAccess(input).allowed) return false;
  return (
    input.analysisStatus === "ready" || input.analysisStatus === "not_requested"
  );
}
