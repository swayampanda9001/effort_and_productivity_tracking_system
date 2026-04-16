import React, { useEffect, type ReactNode, Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import PageLoader from "@/components/loaders/PageLoader";
import NotFoundPage from "@/components/NotFoundPage";

const LoginPage = lazy(() => import("@/pages/auth/login"));
const RegisterPage = lazy(() => import("@/pages/auth/register"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/verify-email"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/reset-password"));

const DashboardLayout = lazy(() => import("@/pages/dashboard-layout"));
const DashboardPage = lazy(() => import("@/pages/team-member-dashboard"));
const TaskDetailsPage = lazy(() => import("@/pages/task"));

const ManagerDashboardPage = lazy(() => import("@/pages/manager-dashboard"));
const SprintsPage = lazy(() => import("@/pages/sprints"));
const SyncTasksPage = lazy(
  () => import("@/pages/manager-dashboard/sync-tasks")
);
const TeamOverview = lazy(
  () => import("@/pages/manager-dashboard/team-overview")
);
const ManageSprintPage = lazy(() => import("@/pages/sprints/sprint"));

const ActionItemsPage = lazy(() => import("@/pages/action-items"));

const CalendarPage = lazy(() => import("@/pages/Calendar"));

const ProfilePage = lazy(() => import("@/pages/profile"));

function App() {
  const { user, isLoading } = useAuth();

  // Set document title based on user role
  useEffect(() => {
    if (user?.role) {
      const roleTitle = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      document.title = `Dashboard - ${roleTitle} | TriNova`;
    } else {
      document.title = "TriNova - The Future of Agile Management";
    }
  }, [user]);

  // Show loading spinner while authentication is being checked
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <div className="w-full min-h-screen bg-background">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/"
              element={
                <PublicRoutes>
                  <Outlet />
                </PublicRoutes>
              }
            >
              <Route index element={<Navigate to="/auth/login" replace />} />
              <Route path="auth/login" element={<LoginPage />} />
              <Route path="auth/register" element={<RegisterPage />} />
              <Route
                path="auth/forgot-password"
                element={<ForgotPasswordPage />}
              />
              <Route
                path="auth/reset-password"
                element={<ResetPasswordPage />}
              />
            </Route>

            {/* Email Verification Route - Authenticated but not fully verified */}
            <Route
              path="/auth/verify-email"
              element={
                <AuthenticatedButUnverified>
                  <VerifyEmailPage />
                </AuthenticatedButUnverified>
              }
            />

            {/* Protected Routes - Requires authentication AND email verification */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoutes>
                  <Outlet />
                </ProtectedRoutes>
              }
            >
              {/* Team Member Routes */}
              <Route
                path="team_member/task/:taskId"
                element={
                  <RoleGuard allowedRoles={["team_member"]}>
                    <TaskDetailsPage />
                  </RoleGuard>
                }
              />
              <Route
                path="team_member"
                element={
                  <RoleGuard allowedRoles={["team_member"]}>
                    <DashboardPage />
                  </RoleGuard>
                }
              />
              <Route path="team_member/calendar" element={
                <RoleGuard allowedRoles={["team_member"]}>
                  <CalendarPage />
                </RoleGuard>
              } />
              <Route
                path="team_member/sprints"
                element={
                  <RoleGuard allowedRoles={["team_member"]}>
                    <SprintsPage />
                  </RoleGuard>
                }
              />
              <Route
                path="team_member/sprints/:sprintId"
                element={
                  <RoleGuard allowedRoles={["team_member"]}>
                    <ManageSprintPage />
                  </RoleGuard>
                }
              />
              <Route
                path="team_member/sprints/:sprintId/task/:taskId"
                element={
                  <RoleGuard allowedRoles={["team_member"]}>
                    <TaskDetailsPage />
                  </RoleGuard>
                }
              />

              {/* Manager Dashboard Routes - Protected by role */}
              {/* Dynamic routes for PM, SM, and Admin */}
              {["pm", "sm"].map((role) => (
                <React.Fragment key={role}>
                  <Route
                    path={role}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <ManagerDashboardPage />
                      </RoleGuard>
                    }
                  />
                  <Route
                    path={`${role}/sprints`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <SprintsPage />
                      </RoleGuard>
                    }
                  />
                  <Route path={`${role}/calendar`} element={
                    <RoleGuard allowedRoles={[role]}>
                      <CalendarPage />
                    </RoleGuard>
                  } />
                  <Route path={`${role}/action-items`} element={
                    <RoleGuard allowedRoles={[role]}>
                      <ActionItemsPage />
                    </RoleGuard>
                  } />
                  <Route
                    path={`${role}/sync-tasks`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <SyncTasksPage />
                      </RoleGuard>
                    }
                  />
                  <Route
                    path={`${role}/sprints/:sprintId`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <ManageSprintPage />
                      </RoleGuard>
                    }
                  />
                  <Route
                    path={`${role}/sprints/:sprintId/task/:taskId`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <TaskDetailsPage />
                      </RoleGuard>
                    }
                  />
                  <Route
                    path={`${role}/team-overview`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <TeamOverview />
                      </RoleGuard>
                    }
                  />
                  <Route
                    path={`${role}/overview`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <ManagerDashboardPage />
                      </RoleGuard>
                    }
                  />
                  <Route
                    path={`${role}/team`}
                    element={
                      <RoleGuard allowedRoles={[role]}>
                        <ManagerDashboardPage />
                      </RoleGuard>
                    }
                  />
                </React.Fragment>
              ))}

              {/* Profile Route - accessible to all authenticated users */}
              <Route path="profile" element={<ProfilePage />} />

              {/* Default redirect for authenticated users */}
              <Route
                index
                element={
                  user ? (
                    user.email_verified ? (
                      <Navigate to={`/dashboard/${user.role}`} replace />
                    ) : (
                      <Navigate to="/auth/verify-email" replace />
                    )
                  ) : (
                    <Navigate to="/auth/login" replace />
                  )
                }
              />
            </Route>

            {/* 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;

// Route Guard Components
const PublicRoutes = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  if (!user) {
    return <>{children}</>;
  }

  // If user is authenticated but not verified, redirect to verification
  if (!user.email_verified) {
    return <Navigate to="/auth/verify-email" replace />;
  }

  // If user is authenticated and verified, redirect to dashboard
  return <Navigate to={`/dashboard/${user.role}`} replace />;
};

const AuthenticatedButUnverified = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  // Must be authenticated to access verification page
  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  // If already verified, redirect to dashboard
  if (user.email_verified) {
    return <Navigate to={`/dashboard/${user.role}`} replace />;
  }

  // User is authenticated but not verified - allow access to verification page
  return <>{children}</>;
};

const ProtectedRoutes = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  // Must be authenticated
  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  // Must have verified email
  if (!user.email_verified) {
    return <Navigate to="/auth/verify-email" replace />;
  }

  // User is authenticated and verified - allow access
  return <DashboardLayout>{children}</DashboardLayout>;
};

// Role-based access control
interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: string[];
  fallback?: ReactNode;
}

const RoleGuard = ({ children, allowedRoles, fallback }: RoleGuardProps) => {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      fallback || (
        <Navigate to={`/dashboard/${user?.role || "team_member"}`} replace />
      )
    );
  }

  return <>{children}</>;
};
