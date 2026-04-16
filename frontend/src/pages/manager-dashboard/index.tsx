import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useSprintStore } from "@/lib/zustand/sprints";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, Users, CheckCircle } from "lucide-react";
import { formatSprintTitle } from "@/utils/Formatter";
import { Button } from "@/components/ui/button";
import { useTeamMembersStore } from "@/lib/zustand/teamMembers";

export default function ManagerDashboardPage() {
  const navigate = useNavigate();
  // const { teamMembers, setTeamMembers } = useTeamMembersStore();
  const { user } = useAuth();
  const { activeSprint, sprints } = useSprintStore();
  const { teamMembers } = useTeamMembersStore();

  if (!activeSprint) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center h-screen">
        <h1 className="text-2xl font-bold text-foreground">
          No active sprint found
        </h1>
        <p className="text-muted-foreground mt-2">
          Please create or select an active sprint to view the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Manager Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitor team performance and manage sprints
          </p>
        </div>
      </div>

      {/* <ManagerTabs /> */}

      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card onClick={() => navigate(`/dashboard/${user?.role}/sprints`)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                No. of Sprints
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {sprints && sprints.length > 0 ? sprints.length : 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {sprints && sprints.length > 0
                  ? sprints.filter((sprint) => sprint.status === "completed")
                      .length
                  : 0}{" "}
                completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {sprints && sprints.length > 0
                  ? sprints.reduce(
                      (acc: any, sprint: any) => acc + sprint.total_tasks,
                      0
                    )
                  : 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {sprints && sprints.length > 0
                  ? sprints.reduce(
                      (acc: any, sprint: any) => acc + sprint.completed_tasks,
                      0
                    )
                  : 0}{" "}
                completed
              </p>
            </CardContent>
          </Card>

          <Card onClick={() => navigate(`/dashboard/${user?.role}/team-overview`)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Team Members
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamMembers.length}</div>
              <p className="text-xs text-muted-foreground">
                All active this sprint
              </p>
            </CardContent>
          </Card>

          {/* <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Delay Alerts
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {mockAnalytics.delayAlerts}
              </div>
              <p className="text-xs text-muted-foreground">Require attention</p>
            </CardContent>
          </Card> */}
        </div>
        {/* Active Sprint Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Current Sprint Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    {formatSprintTitle(activeSprint)}
                  </span>
                  <Badge variant="default">{activeSprint.status}</Badge>
                </div>
                <Progress
                  value={Math.round(
                    ((activeSprint.completed_tasks || 0) /
                      (activeSprint.total_tasks || 1)) *
                      100
                  )}
                  className="h-2"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    {activeSprint.completed_tasks || 0} of{" "}
                    {activeSprint.total_tasks || 0} tasks completed
                  </span>
                  <span>
                    {Math.round(
                      ((activeSprint.completed_tasks || 0) /
                        (activeSprint.total_tasks || 1)) *
                        100
                    ) === 100 && activeSprint.status !== "completed"
                      ? "99%"
                      : `${Math.round(
                          ((activeSprint.completed_tasks || 0) /
                            (activeSprint.total_tasks || 1)) *
                            100
                        )}%`}{" "}
                    complete
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                onClick={() =>
                  navigate(
                    `/dashboard/${user?.role}/sprints/${activeSprint.id}`
                  )
                }
                variant="outline"
                className="flex gap-2 items-center"
              >
                Manage
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {teamMembers && teamMembers.length > 0 ? (
                  teamMembers.slice(0, 3).map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            className="object-cover"
                            src={
                              `${import.meta.env.VITE_R2_BASE_URL}${
                                member?.avatar_url
                              }` || "/placeholder.svg"
                            }
                          />
                          <AvatarFallback>
                            {member?.full_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {member.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {member.completed_tasks || 0} completed •{" "}
                            {member.active_tasks || 0} active
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium flex flex-col items-end">
                          <span className="text-lg font-bold">
                            {(member?.active_tasks || 0) +
                              (member?.completed_tasks || 0)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Total Tasks
                          </span>
                        </div>
                        {/* <div
                          className={`w-2 h-2 rounded-full ${getStatusColor(
                            member.is_active ? "active" : "inactive"
                          )}`}
                        /> */}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No team members found
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Add team members to see performance data
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
