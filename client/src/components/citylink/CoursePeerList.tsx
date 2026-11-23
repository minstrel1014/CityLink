import React, { type ReactNode } from "react";
import type { GroupCoursePeer } from "@/lib/supabaseGroups";

export function CoursePeerList({
  peers,
  renderPeer,
}: {
  peers: GroupCoursePeer[];
  renderPeer: (peer: GroupCoursePeer) => ReactNode;
}) {
  return (
    <section className="classmate-group-section" aria-label="Coursemates">
      <div className="classmate-list">{peers.map(renderPeer)}</div>
    </section>
  );
}
