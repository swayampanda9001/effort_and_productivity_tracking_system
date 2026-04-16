import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSprintStore } from "@/lib/zustand/sprints";
import { useTasksStore } from "@/lib/zustand/tasks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CheckCircle, Clock, Target, Activity } from "lucide-react";
import { formatSprintTitle } from "@/utils/Formatter";
import { calculateEstimatedEffortHours } from "@/utils/calculators";
import ProductivityScoreChart from "@/components/charts/ProductivityScoreChart";
import ProductivityScoreBarChart from "@/components/charts/ProductivityScoreBarChart";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState("overview");
  const { user } = useAuth();
  const { activeSprint, sprints } = useSprintStore();
  const { activeSprintTasks } = useTasksStore();

  // Get current user's team_member_id from sprint members
  const currentTeamMemberId = activeSprint?.sprint_members?.find(
    (member) => member.team_member_name === user?.full_name
  )?.team_member_id;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "destructive";
      case "Medium":
        return "default";
      case "Low":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "in_progress":
        return "bg-primary";
      case "review":
        return "bg-yellow-500";
      case "blocked":
        return "bg-red-500";
      case "on_hold":
        return "bg-blue-500";
      case "overdue":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  // const formatDate = (dateString: string) => {
  //   const date = new Date(dateString);
  //   return date.toLocaleDateString("en-US", {
  //     year: "numeric",
  //     month: "short",
  //     day: "numeric",
  //   });
  // };

  useEffect(() => {
    if (activeSprint) {
      console.log(`Active Sprint: ${activeSprint}`);
    }
  }, [activeSprint]);

  if (!activeSprint) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>No active sprint found. Please contact your manager.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.full_name}! Here's your productivity overview.
        </p>
      </div>

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="active-sprint">Active Sprint</TabsTrigger>
          {/* <TabsTrigger value="performance">Performance</TabsTrigger> */}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Sprints
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sprints?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-400 font-semibold">
                    {
                      sprints.filter((sprint) => sprint.status === "completed")
                        .length
                    }
                  </span>{" "}
                  completed
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Completed Tasks
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {sprints
                    ?.map((sprint) => sprint.completed_tasks || 0)
                    .reduce((a, b) => a + b, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  of{" "}
                  <span className="text-green-400 font-semibold">
                    {sprints
                      ?.map((sprint) => sprint.total_tasks || 0)
                      .reduce((a, b) => a + b, 0)}
                  </span>{" "}
                  total tasks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Productivity Score
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {
                    sprints[0]?.sprint_members?.find(
                      (member) => member.team_member_id === currentTeamMemberId
                    )?.team_member_productivity_score
                  }
                  
                </div>
                <p className="text-xs text-muted-foreground">
                  Overall Productivity Score
                </p>
              </CardContent>
            </Card>

            {/* <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Productivity Score
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {mockPerformanceData.productivity.score}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mockPerformanceData.productivity.rating} performance
                </p>
              </CardContent>
            </Card> */}

            {/* <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Effort Variance
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(
                    ((activeSprintTasks.reduce(
                      (acc: any, task: any) => acc + task.logged_effort_hours,
                      0
                    ) || 0) /
                      (activeSprintTasks.reduce(
                        (acc: any, task: any) =>
                          acc + task.estimated_effort_hours,
                        0
                      ) || 0)) *
                    100
                  ).toFixed(0)}
                  %
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeSprintTasks.reduce(
                    (acc: any, task: any) => acc + task.logged_effort_hours,
                    0
                  ) || 0}
                  h /{" "}
                  {activeSprintTasks.reduce(
                    (acc: any, task: any) => acc + task.estimated_effort_hours,
                    0
                  ) || 0}
                  h logged
                </p>
              </CardContent>
            </Card> */}
          </div>

          {/* Productivity Comparison Chart */}
          {/* Productivity Score Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProductivityScoreChart
              sprints={sprints}
              currentUserId={currentTeamMemberId}
            />
            <ProductivityScoreBarChart
              sprints={sprints}
              currentUserId={currentTeamMemberId}
            />
          </div>
        </TabsContent>

        <TabsContent value="active-sprint" className="space-y-6">
          {/* Current Sprint Overview */}
          <Card className="w-full">
            <CardHeader className="w-full">
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {formatSprintTitle(activeSprint)}
                  </CardTitle>
                  <CardDescription>
                    {activeSprint?.description || "No description available"}
                  </CardDescription>
                </div>
                <Button
                  onClick={() =>
                    navigate(
                      `/dashboard/${user?.role}/sprints/${activeSprint.id}`
                    )
                  }
                  variant="outline"
                  size="sm"
                >
                  View Details
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-sm text-muted-foreground">
                    {activeSprint.completed_tasks || 0} of{" "}
                    {activeSprint.total_tasks || 0} tasks
                  </span>
                </div>
                <Progress
                  value={
                    activeSprint.total_tasks &&
                    activeSprint.completed_tasks &&
                    activeSprint.total_tasks > 0
                      ? (activeSprint.completed_tasks /
                          activeSprint.total_tasks) *
                        100
                      : 0
                  }
                  className="h-2"
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-muted-foreground">
                      {activeSprintTasks.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Tasks
                    </div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {activeSprintTasks.filter(
                        (task) => task.status === "completed"
                      ).length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Completed Tasks
                    </div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-muted-foreground">
                      {activeSprintTasks.reduce(
                        (acc: any, task: any) =>
                          acc + task.estimated_effort_hours,
                        0
                      ) || 0}
                      h
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Planned Effort
                    </div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {activeSprintTasks.reduce(
                        (acc: any, task: any) => acc + task.logged_effort_hours,
                        0
                      ) || 0}
                      h
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {activeSprintTasks.every(
                        (task) => task.status === "completed"
                      )
                        ? "Actual Effort"
                        : "Logged Efforts"}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Active Sprint Tasks */}
          {activeSprintTasks.length > 0 ? (
            <div className="grid gap-4">
              {activeSprintTasks.map((task) => (
                <Card
                  key={task.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 flex-wrap-reverse">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{task.title}</CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                          <Badge variant="outline">{task.stage}</Badge>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Due: {task.due_date}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${getStatusColor(
                            task.status
                          )}`}
                        />
                        <Badge variant="outline" className="text-xs">
                          {task.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Effort: {task.logged_effort_hours || 0}h /{" "}
                        {task.estimated_effort_hours}h
                      </div>
                      <Button
                        onClick={() =>
                          navigate(
                            `/dashboard/${user?.role}/sprints/${activeSprint.id}/task/${task.id}`
                          )
                        }
                        variant="outline"
                        size="sm"
                      >
                        View Details
                      </Button>
                    </div>
                    <Progress
                      value={
                        task.status === "completed"
                          ? 100
                          : task.estimated_effort_hours > 0
                          ? (task.logged_effort_hours /
                              task.estimated_effort_hours) *
                              100 >
                            100
                            ? 99
                            : (task.logged_effort_hours /
                                task.estimated_effort_hours) *
                              100
                          : 0
                      }
                      className="mt-2 h-1"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              No tasks assigned for this sprint.
            </div>
          )}
        </TabsContent>

        {/* <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6"> */}
        {/* <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>
                  Your current sprint performance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    Productivity Score
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    {mockPerformanceData.productivity.score}
                  </span>
                </div>
                <Progress value={mockPerformanceData.productivity.score} />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Rating</span>
                    <Badge variant="default">
                      {mockPerformanceData.productivity.rating}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Delays</span>
                    <span className="text-sm font-medium">
                      {mockPerformanceData.productivity.delayCount}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card> */}

        {/* <Card>
              <CardHeader>
                <CardTitle>Effort Analysis</CardTitle>
                <CardDescription>
                  Estimated vs actual effort comparison
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Accuracy Rate</span>
                    <span className="text-lg font-semibold">
                      {(
                        ((activeSprintTasks.reduce(
                          (acc: any, task: any) =>
                            acc + task.logged_effort_hours,
                          0
                        ) || 0) /
                          (activeSprintTasks.reduce(
                            (acc: any, task: any) =>
                              acc + task.estimated_effort_hours,
                            0
                          ) || 0)) *
                        100
                      ).toFixed(0)}
                      %
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Planned</span>
                      <span>
                        {activeSprintTasks.reduce(
                          (acc: any, task: any) =>
                            acc + task.estimated_effort_hours,
                          0
                        ) || 0}
                        h
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Actual</span>
                      <span>
                        {activeSprintTasks.reduce(
                          (acc: any, task: any) =>
                            acc + task.logged_effort_hours,
                          0
                        ) || 0}
                        h
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Variance</span>
                      <span
                        className={
                          activeSprintTasks.reduce(
                            (acc: any, task: any) =>
                              acc + task.logged_effort_hours,
                            0
                          ) <
                          activeSprintTasks.reduce(
                            (acc: any, task: any) =>
                              acc + task.estimated_effort_hours,
                            0
                          )
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {activeSprintTasks.reduce(
                          (acc: any, task: any) =>
                            acc + task.logged_effort_hours,
                          0
                        ) -
                          activeSprintTasks.reduce(
                            (acc: any, task: any) =>
                              acc + task.estimated_effort_hours,
                            0
                          ) >
                        0
                          ? "+"
                          : ""}
                        {activeSprintTasks.reduce(
                          (acc: any, task: any) =>
                            acc + task.logged_effort_hours,
                          0
                        ) -
                          activeSprintTasks.reduce(
                            (acc: any, task: any) =>
                              acc + task.estimated_effort_hours,
                            0
                          ) || 0}
                        h
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card> */}
        {/* </div>
        </TabsContent> */}
      </Tabs>
    </div>
  );
}
