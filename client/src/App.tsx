import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import NotFound from "@/pages/NotFound";
import { AppProvider } from "@/data/AppContext";
import { SupabaseSessionProvider } from "@/contexts/SupabaseSessionContext";
import Welcome from "@/pages/citylink/Welcome";
import Dashboard, { Courses } from "@/pages/citylink/Dashboard";
import MyCourses from "@/pages/citylink/MyCourses";
import GroupWorkflows from "@/pages/citylink/GroupWorkflows";
import GroupWorkspacePage from "@/pages/citylink/GroupWorkspacePage";
import GroupChatPage from "@/pages/citylink/GroupChatPage";
import {
  GroupMemberProfilePage,
  GroupMembersPage,
} from "@/pages/citylink/GroupMembersPage";
import { Classmates, StudentProfile } from "@/pages/citylink/Classmates";
import AuthenticatedCourseDetail from "@/pages/citylink/AuthenticatedCourseDetail";
import AuthenticatedMyGroup from "@/pages/citylink/AuthenticatedMyGroup";
import StudentPortfolio from "@/pages/citylink/StudentPortfolio";
import {
  Invitations,
  MyProfile,
  Messages,
  About,
} from "@/pages/citylink/Workspace";
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
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
              <Route path="/courses" component={Courses} />
              <Route path="/demo/courses/:courseId">
                {params => <Classmates courseId={params.courseId} />}
              </Route>
              <Route path="/courses/:courseId/students/:studentId">
                {params => (
                  <StudentPortfolio
                    key={`${params.courseId}:${params.studentId}`}
                    courseId={params.courseId}
                    studentId={params.studentId}
                  />
                )}
              </Route>
              <Route path="/courses/:courseId/classmates">
                {params => (
                  <AuthenticatedCourseDetail
                    key={params.courseId}
                    courseId={params.courseId}
                  />
                )}
              </Route>
              <Route path="/courses/:courseId">
                {params => (
                  <AuthenticatedMyGroup
                    key={params.courseId}
                    courseId={params.courseId}
                  />
                )}
              </Route>
              <Route path="/students/:studentId/:courseId">
                {params => (
                  <StudentProfile
                    studentId={params.studentId}
                    courseId={params.courseId}
                  />
                )}
              </Route>
              <Route path="/invitations" component={Invitations} />
              <Route path="/me" component={MyProfile} />
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
              <Route path="/my-courses" component={MyCourses} />
              <Route path="/my-groups" component={GroupWorkflows} />
              <Route path="/messages" component={Messages} />
              <Route path="/about" component={About} />
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </AppProvider>
        </TooltipProvider>
      </SupabaseSessionProvider>
    </ErrorBoundary>
  );
}
