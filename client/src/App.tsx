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
import { Classmates, StudentProfile } from "@/pages/citylink/Classmates";
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
              <Route path="/courses/:courseId">
                {params => <Classmates courseId={params.courseId} />}
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
