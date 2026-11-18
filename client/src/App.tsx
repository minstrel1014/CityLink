import { useEffect, type ReactNode } from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotFound from "@/pages/NotFound";
import { AppProvider } from "@/data/AppContext";
import {
  SupabaseSessionProvider,
  useSupabaseSession,
  type SupabaseSessionState,
} from "@/contexts/SupabaseSessionContext";
import Welcome from "@/pages/citylink/Welcome";
import Dashboard, { Courses } from "@/pages/citylink/Dashboard";
import MyCourses from "@/pages/citylink/MyCourses";
import GroupWorkflows from "@/pages/citylink/GroupWorkflows";
import { Classmates, StudentProfile } from "@/pages/citylink/Classmates";
import AuthenticatedCourseDetail from "@/pages/citylink/AuthenticatedCourseDetail";
import AuthenticatedMyGroup from "@/pages/citylink/AuthenticatedMyGroup";
import GroupChatPlaceholder from "@/pages/citylink/GroupChatPlaceholder";
import GroupWorkspacePage from "@/pages/citylink/GroupWorkspacePage";
import GroupChatPage from "@/pages/citylink/GroupChatPage";
import {
  GroupMemberProfilePage,
  GroupMembersPage,
} from "@/pages/citylink/GroupMembersPage";
import StudentPortfolio from "@/pages/citylink/StudentPortfolio";
import AuthenticatedProfile from "@/pages/citylink/AuthenticatedProfile";
import {
  AuthenticatedAbout,
  AuthenticatedInvitations,
  AuthenticatedMessages,
} from "@/pages/citylink/AuthenticatedWorkspacePages";
import {
  Invitations,
  MyProfile,
  DemoMyProfile,
  Messages,
  About,
} from "@/pages/citylink/Workspace";
import AppShell from "@/components/citylink/AppShell";
import { workspaceSessionMode } from "@/lib/workspaceRouteRules";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function WorkspacePage({
  title,
  renderAuthenticated,
  signedOut,
}: {
  title: string;
  renderAuthenticated: (session: SupabaseSessionState) => ReactNode;
  signedOut: ReactNode;
}) {
  const session = useSupabaseSession();
  const mode = workspaceSessionMode(session.status, session.user?.id);
  if (mode === "loading") {
    return (
      <div className="workspace-route-loading" role="status" aria-busy="true">
        Restoring your CityLink sign-in…
      </div>
    );
  }
  if (mode === "error") {
    return (
      <main className="workspace-route-loading">
        <div role="alert">
          <h1>Your sign-in is unavailable</h1>
          <p>
            We could not restore your account session. Return to sign-in and try
            again.
          </p>
          <Link href="/">Return to sign-in</Link>
        </div>
      </main>
    );
  }
  if (mode === "authenticated") {
    return <AppShell title={title}>{renderAuthenticated(session)}</AppShell>;
  }
  return signedOut;
}

export default function App() {
  return (
    <ErrorBoundary>
      <SupabaseSessionProvider>
        <TooltipProvider>
          <AppProvider>
            <Toaster position="top-center" richColors closeButton />
            <ScrollToTop />
            <Switch>
              <Route path="/" component={Welcome} />
              <Route path="/demo" component={Dashboard} />
              <Route path="/demo/courses" component={Courses} />
              <Route path="/demo/invitations" component={Invitations} />
              <Route path="/demo/messages" component={Messages} />
              <Route path="/demo/me" component={DemoMyProfile} />
              <Route path="/demo/about" component={About} />
              <Route path="/demo/students/:studentId/:courseId">
                {params => (
                  <StudentProfile
                    studentId={params.studentId}
                    courseId={params.courseId}
                  />
                )}
              </Route>
              <Route path="/dashboard">
                {() => (
                  <WorkspacePage
                    title="Dashboard"
                    renderAuthenticated={() => (
                      <MyCourses key="dashboard" view="dashboard" embedded />
                    )}
                    signedOut={<Welcome />}
                  />
                )}
              </Route>
              <Route path="/courses">
                {() => (
                  <WorkspacePage
                    title="Courses"
                    renderAuthenticated={() => (
                      <MyCourses key="directory" view="directory" embedded />
                    )}
                    signedOut={<Courses />}
                  />
                )}
              </Route>
              <Route path="/demo/courses/:courseId">
                {params => <Classmates courseId={params.courseId} />}
              </Route>
              <Route path="/courses/:courseId/students/:studentId">
                {params => (
                  <WorkspacePage
                    title="Course profile"
                    renderAuthenticated={() => (
                      <StudentPortfolio
                        key={`${params.courseId}:${params.studentId}`}
                        courseId={params.courseId}
                        studentId={params.studentId}
                      />
                    )}
                    signedOut={
                      <StudentPortfolio
                        key={`${params.courseId}:${params.studentId}`}
                        courseId={params.courseId}
                        studentId={params.studentId}
                      />
                    }
                  />
                )}
              </Route>
              <Route path="/courses/:courseId/classmates">
                {params => (
                  <WorkspacePage
                    title="Coursemates"
                    renderAuthenticated={() => (
                      <AuthenticatedCourseDetail
                        key={params.courseId}
                        courseId={params.courseId}
                      />
                    )}
                    signedOut={
                      <AuthenticatedCourseDetail
                        key={params.courseId}
                        courseId={params.courseId}
                      />
                    }
                  />
                )}
              </Route>
              <Route path="/courses/:courseId">
                {params => (
                  <WorkspacePage
                    title="My group"
                    renderAuthenticated={() => (
                      <AuthenticatedMyGroup
                        key={params.courseId}
                        courseId={params.courseId}
                      />
                    )}
                    signedOut={
                      <AuthenticatedMyGroup
                        key={params.courseId}
                        courseId={params.courseId}
                      />
                    }
                  />
                )}
              </Route>
              <Route path="/students/:studentId/:courseId">
                {params => (
                  <WorkspacePage
                    title="Course profile"
                    renderAuthenticated={() => (
                      <StudentPortfolio
                        key={`${params.courseId}:${params.studentId}`}
                        courseId={params.courseId}
                        studentId={params.studentId}
                      />
                    )}
                    signedOut={
                      <StudentProfile
                        studentId={params.studentId}
                        courseId={params.courseId}
                      />
                    }
                  />
                )}
              </Route>
              <Route path="/invitations">
                {() => (
                  <WorkspacePage
                    title="Invitations"
                    renderAuthenticated={() => <AuthenticatedInvitations />}
                    signedOut={<Invitations />}
                  />
                )}
              </Route>
              <Route path="/me">
                {() => (
                  <WorkspacePage
                    title="My profile"
                    renderAuthenticated={session => (
                      <AuthenticatedProfile userId={session.user!.id} />
                    )}
                    signedOut={<MyProfile />}
                  />
                )}
              </Route>
              <Route path="/my-courses/:courseId/groups">
                {params => <GroupWorkspacePage courseId={params.courseId} />}
              </Route>
              <Route path="/groups/:groupId/chat">
                {params => <GroupChatPage groupId={params.groupId} />}
              </Route>
              <Route path="/groups/:groupId/members/:profileId">
                {params => (
                  <GroupMemberProfilePage
                    groupId={params.groupId}
                    profileId={params.profileId}
                  />
                )}
              </Route>
              <Route path="/groups/:groupId/members">
                {params => <GroupMembersPage groupId={params.groupId} />}
              </Route>
              <Route path="/my-courses">
                <Redirect to="/dashboard" replace />
              </Route>
              <Route path="/my-groups">
                {() => (
                  <WorkspacePage
                    title="My groups"
                    renderAuthenticated={() => <GroupWorkflows />}
                    signedOut={<GroupWorkflows />}
                  />
                )}
              </Route>
              <Route path="/group-chat">
                {() => (
                  <WorkspacePage
                    title="Group chat"
                    renderAuthenticated={() => <GroupChatPlaceholder />}
                    signedOut={<GroupChatPlaceholder />}
                  />
                )}
              </Route>
              <Route path="/messages">
                {() => (
                  <WorkspacePage
                    title="Messages"
                    renderAuthenticated={() => <AuthenticatedMessages />}
                    signedOut={<Messages />}
                  />
                )}
              </Route>
              <Route path="/about">
                {() => (
                  <WorkspacePage
                    title="About this demo"
                    renderAuthenticated={() => <AuthenticatedAbout />}
                    signedOut={<About />}
                  />
                )}
              </Route>
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </AppProvider>
        </TooltipProvider>
      </SupabaseSessionProvider>
    </ErrorBoundary>
  );
}
