import { ArrowLeft, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { AccountHeader } from "@/pages/citylink/MyCourses";
import { useSupabaseSession } from "@/contexts/SupabaseSessionContext";
import { EmptyState } from "@/components/citylink/Shared";

export default function GroupChatPlaceholder() {
  const session = useSupabaseSession();

  return (
    <div className="authenticated-courses-page course-detail-page">
      <AccountHeader email={session.user?.email} />
      <main className="authenticated-courses-main">
        <Link href="/my-courses" className="back-link">
          <ArrowLeft size={17} /> Back to My Courses
        </Link>
        <EmptyState
          title="Group chat is coming soon"
          description="Another teammate is building the group chat. This page is a placeholder so the Open Group Chat link has a destination; messages cannot be sent yet."
        >
          <div className="authenticated-courses-state-actions">
            <Link href="/my-groups" className="primary">
              <MessageCircle size={16} /> My Groups
            </Link>
          </div>
        </EmptyState>
      </main>
    </div>
  );
}
