import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "@/lib/axios/instance";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "react-router-dom";
import { formatSprintTitle } from "@/utils/Formatter";
import {
  getOverdueDays,
  getSeverity,
  getTaskOverdueInfo,
} from "@/utils/taskUtils";
import {
  getStatusColor,
  getPriorityColor,
  getSeverityColor,
} from "@/utils/colorCases";
import { useSprintStore } from "@/lib/zustand/sprints";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Target,
  TrendingUp,
  AlertTriangle,
  Activity,
  ArrowUp,
  ArrowDown,
  Minus,
  Filter,
  CalendarClock,
} from "lucide-react";
import EditSprintDialog from "@/components/dialogs/EditSprint";
import AddTaskDialog from "@/components/dialogs/AddTask";
import AlertsComponent from "@/components/AlertsComponent";
import TeamMemberTaskBreakdownDialog from "@/components/dialogs/TeamMemberTaskBreakdownDialog";
import {
  calculateEstimatedEffortHours,
  calculateSprintProgress,
  remainingDaysCalculator,
} from "@/utils/calculators";
import { calculateCurrentSprintVelocity } from "@/utils/velocityCalculator";
import LoadingSpinner from "@/components/loaders/LoadingSpinner";
import { toast } from "sonner";
import { CompactTaskAssignments } from "@/components/TaskAssignmentsDisplay";

export default function ManageSprintPage() {
  const { sprintId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedTab, setSelectedTab] = useState(
    searchParams.get("tab") || "overview"
  );
  const [taskFilter, setTaskFilter] = useState("all");
  const [teamFilter] = useState("all");
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showEditSprintDialog, setShowEditSprintDialog] = useState(false);
  const [showTaskBreakdownDialog, setShowTaskBreakdownDialog] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<any>(null);
  const { user } = useAuth();
  const { sprint, setSprint } = useSprintStore();
  const [tasks, setTasks] = useState<any[]>([]);
  const [sprintMembers, setSprintMembers] = useState<any[]>([]);
  const [effortDistribution, setEffortDistribution] = useState<any[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [reminderCounts, setReminderCounts] = useState<Record<number, any>>({});

  // Calculate real team velocity based on current sprint data
  const velocityData = React.useMemo(() => {
    return calculateCurrentSprintVelocity(sprint, tasks);
  }, [sprint, tasks]);

  // Fetch reminder counts for the sprint
  const { data: sprintReminderCounts } = useQuery({
    queryKey: ["reminderCounts", sprintId],
    queryFn: async () => {
      if (!sprintId || user?.role === "team_member") return [];
      const response = await API.get(
        `/alerts/reminder-counts/sprint/${sprintId}`
      );
      return response.data;
    },
    enabled: !!sprintId && user?.role !== "team_member",
  });

  // Update reminder counts when data is fetched
  useEffect(() => {
    if (sprintReminderCounts) {
      const countsMap = sprintReminderCounts.reduce((acc: any, item: any) => {
        acc[item.task_id] = item;
        return acc;
      }, {});
      setReminderCounts(countsMap);
    }
  }, [sprintReminderCounts]);

  // Mutation for sending overdue task reminders
  const sendReminderMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await API.post(
        `/alerts/overdue-task-reminder?task_id=${taskId}`
      );
      return { ...response.data, task_id: taskId }; // Ensure task_id is included
    },
    onSuccess: (data) => {
      console.log("Reminder sent successfully:", data);

      // Update local reminder count
      setReminderCounts((prev) => ({
        ...prev,
        [data.task_id]: {
          ...prev[data.task_id],
          reminder_count: data.reminder_count,
          last_reminder_sent: new Date().toISOString(),
        },
      }));
      toast.success(
        `Reminder sent successfully to ${data.assignee} for task: ${data.task_title}\nTotal reminders sent: ${data.reminder_count}`
      );
    },
    onError: (error: any) => {
      console.error("Error sending reminder:", error);
      const errorMessage =
        error.response?.data?.detail || "Failed to send reminder";
      toast.error(`Error: ${errorMessage}`);
    },
  });

  // Helper function to send reminder
  const handleSendReminder = (taskId: number) => {
    sendReminderMutation.mutate(taskId);
  };

  // Filter overdue tasks when tasks change
  useEffect(() => {
    if (tasks.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison

      const overdueTasksList = tasks.filter((task) => {
        if (!task.due_date) return false;

        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Task is overdue if: due date has passed AND task is in progress
        return dueDate < today && task.status === "in_progress";
      });

      setOverdueTasks(overdueTasksList);
    } else {
      setOverdueTasks([]);
    }
  }, [tasks]);

  // Calculate effort distribution when tasks change
  useEffect(() => {
    if (tasks.length > 0 || sprint) {
      const stageDistribution = tasks.reduce((acc, task) => {
        const stage = task.stage || "unspecified";
        const estimatedHours = task.estimated_effort_hours || 0;
        const loggedHours = task.logged_effort_hours || 0;

        if (!acc[stage]) {
          acc[stage] = {
            stage: stage,
            assignedHours: 0,
            loggedHours: 0,
            percentage: 0,
            taskCount: 0,
          };
        }

        acc[stage].assignedHours += estimatedHours;
        acc[stage].loggedHours += loggedHours;
        acc[stage].taskCount += 1;

        return acc;
      }, {} as Record<string, any>);

      // Calculate total assigned hours from tasks
      const totalTaskAssignedHours = Object.values(stageDistribution).reduce(
        (sum: number, stage: any) => sum + stage.assignedHours,
        0
      );

      // Calculate total estimated effort hours for the sprint
      const totalSprintEstimatedHours = sprint
        ? calculateEstimatedEffortHours(sprint.start_date, sprint.end_date)
        : 0;

      const distributionArray = Object.values(stageDistribution).map(
        (stage: any) => ({
          ...stage,
          percentage:
            totalTaskAssignedHours > 0
              ? Math.round((stage.assignedHours / totalTaskAssignedHours) * 100)
              : 0,
          loggedPercentage:
            stage.assignedHours > 0
              ? Math.round((stage.loggedHours / stage.assignedHours) * 100)
              : 0,
        })
      );

      setEffortDistribution(distributionArray);
    }
  }, [tasks, sprint]);

  const fetchSprintMembers = async () => {
    if (!sprintId) return;

    try {
      // Use the dedicated sprint members endpoint
      const response = await API.get(`/sprints/${sprintId}/sprint-members`);
      console.log("Fetched sprint members:", response.data);
      const sprintMembersData = response.data;

      // Map the response to the format expected by the UI
      const currentSprintMembers = sprintMembersData.map((member: any) => ({
        id: member.id,
        user_id: member.user_id,
        name: member.full_name,
        role: member.role,
        avatar_url: member.avatar_url || "/placeholder.svg",
        email: member.email,
        skills: member.skills,
        productivity_score: member.productivity_score,
      }));

      setSprintMembers(currentSprintMembers);
      return currentSprintMembers;
    } catch (error) {
      console.error("Error loading sprint members:", error);
      // Fallback: if we can't load from dedicated endpoint, use sprint data
      if (sprint?.sprint_members) {
        const fallbackMembers = sprint.sprint_members.map((sm) => ({
          id: sm.team_member_id,
          name: `Team Member ${sm.team_member_id}`, // Fallback name since we don't have user details
          role: sm.role || "developer",
        }));
        setSprintMembers(fallbackMembers);
      }
    }
  };

  // Get team members that are part of this sprint - use loaded sprint members directly
  const sprintTeamMembers = React.useMemo(() => {
    return sprintMembers.map((member) => ({
      id: member.id,
      name: member.name,
    }));
  }, [sprintMembers]);

  const fetchTasks = async () => {
    if (!sprintId) {
      console.error("Sprint ID is required to fetch tasks");
      return;
    }
    try {
      const response = await API.get(
        `/tasks/?skip=0&limit=100&sprint_id=${sprintId}`
      );
      console.log("Fetched tasks:", response.data);
      setTasks(response.data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    }
  };

  const fetchSprintData = async (calledAfterEdit: boolean) => {
    if (!sprintId) {
      console.error("Sprint ID is required to fetch sprint data");
      return;
    }
    if (
      sprint &&
      sprintId &&
      parseInt(sprintId) === sprint.id &&
      !calledAfterEdit
    ) {
      console.log("Using zustand sprint data:", sprint);
      fetchTasks();
      return sprint;
    }
    try {
      const response = await API.get(`/sprints/${sprintId}`);
      console.log("Fetched sprint data:", response.data);
      setSprint(response.data);
      fetchTasks();
      return response.data;
    } catch (error) {
      console.error("Error fetching sprint data:", error);
      throw error;
    }
  };

  const { isLoading, isError } = useQuery({
    queryKey: ["sprint", sprintId],
    queryFn: () => fetchSprintData(false),
  });

  const { isLoading: isMembersLoading, isError: isMembersError } = useQuery({
    queryKey: ["sprintMembers", sprintId],
    queryFn: fetchSprintMembers,
    enabled: !!sprintId,
  });

  const getTrendIcon = (current?: number, previous?: number) => {
    if (
      current === undefined ||
      previous === undefined ||
      current === previous
    ) {
      return <Minus className="h-3 w-3 text-gray-500" />;
    }

    return current > previous ? (
      <ArrowUp className="h-3 w-3 text-green-500" />
    ) : (
      <ArrowDown className="h-3 w-3 text-red-500" />
    );
  };

  const filteredTasks =
    taskFilter === "all"
      ? tasks
      : tasks.filter((task) => task.status === taskFilter);

  // Use actual sprint members data instead of mock data
  const filteredTeamMembers = React.useMemo(() => {
    // Transform sprint members to match the expected format
    const transformedMembers = sprintMembers.map((member) => ({
      id: member.id,
      user_id: member.user_id,
      name: member.name,
      avatar_url: member.avatar_url || "/placeholder.svg", // Default avatar
      activeTasks: tasks.filter(
        (task) =>
          task.assigned_to_name === member.name &&
          ["new", "in_progress", "review", "testing"].includes(task.status)
      ).length,
      completedTasks: tasks.filter(
        (task) =>
          task.assigned_to_name === member.name && task.status === "completed"
      ).length,
      loggedHours: tasks
        .filter((task) => task.assigned_to_name === member.name)
        .reduce((sum, task) => sum + (task.logged_effort_hours || 0), 0),
      productivity_score: member.productivity_score || 0, // Use actual productivity score or default
      onTrack: (member.productivity_score || 0) >= 80, // Consider on track if productivity >= 80%
      lastActive: "Recently", // Default value since we don't have this data
      email: member.email,
      skills: member.skills,
      role: member.role,
    }));

    // Apply filter
    if (teamFilter === "all") {
      return transformedMembers;
    } else if (teamFilter === "on-track") {
      return transformedMembers.filter((member) => member.onTrack);
    } else {
      return transformedMembers.filter((member) => !member.onTrack);
    }
  }, [sprintMembers, tasks, teamFilter]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError || !sprint) {
    return <div>Error loading sprint data</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Sprint Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-6 md:gap-2 flex-col md:flex-row">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {sprint ? formatSprintTitle(sprint) : "Loading Sprint..."}
            </h1>
            <p className="text-muted-foreground mt-2">{sprint?.description}</p>
            <div className="flex items-center flex-wrap gap-4 mt-4">
              <Badge
                variant={sprint?.status === "active" ? "default" : "secondary"}
              >
                {sprint?.status}
              </Badge>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                <span className="dark:text-primary-foreground font-bold">
                  {tasks.reduce(
                    (sum, task) => sum + (task.estimated_effort_hours || 0),
                    0
                  )}
                  h
                </span>
                {/* of{" "}
                <span className="">
                  {calculateEstimatedEffortHours(
                    sprint.start_date,
                    sprint.end_date
                  )} 
                  h
                </span> */}
                planned
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {remainingDaysCalculator(
                  sprint?.start_date,
                  sprint?.end_date
                )}{" "}
                days remaining
              </div>
            </div>
          </div>
          {user?.role !== "team_member" && (
            <div className="flex gap-2">
              {sprint && (
                <EditSprintDialog
                  open={showEditSprintDialog}
                  onOpenChange={setShowEditSprintDialog}
                  sprintData={{
                    id: sprint?.id,
                    name: sprint?.name,
                    description: sprint?.description || "",
                    startDate: sprint?.start_date,
                    endDate: sprint?.end_date,
                    status: sprint?.status,
                    sprint_members:
                      sprint?.sprint_members?.map((member) => ({
                        team_member_id: member.team_member_id,
                        role: member.role || "developer",
                      })) || [],
                  }}
                  onSprintUpdated={() => {
                    fetchSprintData(true);
                  }}
                />
              )}
              <AddTaskDialog
                open={showAddTaskDialog}
                onOpenChange={setShowAddTaskDialog}
                teamMembers={sprintTeamMembers}
                sprintName={sprint?.name}
                sprintStartDate={sprint?.start_date}
                sprintDuration={sprint?.duration}
                sprintEndDate={sprint?.end_date}
                onTaskCreated={(taskData) => {
                  console.log("New task created:", taskData);
                  // Refresh tasks after creating a new one
                  fetchTasks();
                }}
              />
            </div>
          )}
        </div>
      </div>

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Sprint Progress
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {calculateSprintProgress(
                    sprint.completed_tasks,
                    tasks.length
                  )}
                  %
                </div>
                <Progress
                  value={calculateSprintProgress(
                    sprint.completed_tasks,
                    tasks.length
                  )}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {tasks.filter((t) => t.status === "completed").length} of{" "}
                  {tasks.length} tasks completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Effort Tracking
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tasks.reduce(
                    (acc, task) => acc + (task.logged_effort_hours || 0),
                    0
                  )}
                  h
                </div>
                <p className="text-xs text-muted-foreground">
                  of{" "}
                  {tasks.reduce(
                    (sum, task) => sum + (task.estimated_effort_hours || 0),
                    0
                  )}
                  h logged
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {getTrendIcon(
                    tasks.reduce(
                      (acc, task) => acc + (task.logged_effort_hours || 0),
                      0
                    ),
                    tasks.reduce(
                      (acc, task) => acc + (task.estimated_effort_hours || 0),
                      0
                    ) * 0.6
                  )}
                  <span className="text-xs text-muted-foreground">
                    {(
                      (tasks.reduce(
                        (acc, task) => acc + (task.logged_effort_hours || 0),
                        0
                      ) /
                        tasks.reduce(
                          (acc, task) =>
                            acc + (task.estimated_effort_hours || 0),
                          0
                        )) *
                      100
                    ).toFixed(1)}
                    % utilized
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Team Velocity
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {velocityData.taskVelocity}
                </div>
                <p className="text-xs text-muted-foreground">tasks per day</p>
                <div className="flex items-center gap-1 mt-2">
                  {getTrendIcon(
                    parseFloat(velocityData.taskVelocity),
                    8.5 // Mock previous velocity - would come from API
                  )}
                  <span className="text-xs text-muted-foreground">
                    {velocityData.effortVelocity}h effort per day
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active Issues
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {overdueTasks.length}
                </div>
                <p className="text-xs text-muted-foreground">overdue tasks</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-xs text-destructive">Delay alerts</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sprint Timeline */}
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Effort Distribution</CardTitle>
                <CardDescription>
                  Time allocation across different stages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {effortDistribution.map((stage) => (
                    <div key={stage.stage} className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">
                          {stage.stage.slice(0, 1).toUpperCase() +
                            stage.stage.slice(1)}
                        </span>
                        <span className="text-sm font-medium">
                          {stage.assignedHours}h ({stage.percentage}%)
                        </span>
                      </div>
                      <Progress
                        title={stage.stage}
                        value={stage.percentage}
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-2xl font-bold">Sprint Tasks</h2>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={taskFilter} onValueChange={setTaskFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter tasks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tasks</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4">
            {filteredTasks.map((task) => (
              <Card
                key={task.id}
                className={`hover:shadow-md transition-shadow ${
                  task.status === "cancelled" ? "opacity-50" : ""
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <CardTitle className="text-lg">{task.title}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={getPriorityColor(task.priority)}>
                          {task.priority.charAt(0).toUpperCase() +
                            task.priority.slice(1)}
                        </Badge>
                        <Badge variant="outline">
                          {task.stage.charAt(0).toUpperCase() +
                            task.stage.slice(1)}
                        </Badge>
                        {/* Overdue Badge */}
                        {(() => {
                          const { isOverdue, overdueDays } =
                            getTaskOverdueInfo(task);
                          return isOverdue ? (
                            <Badge variant="destructive">
                              Overdue by {overdueDays}{" "}
                              {overdueDays === 1 ? "day" : "days"}
                            </Badge>
                          ) : null;
                        })()}
                        {task.tags && task.tags[0] !== "" && (
                          <div className="flex gap-1">
                            {task.tags
                              .slice(0, 2)
                              .map((tag: string, index: number) => (
                                <Badge
                                  key={index}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            {task.tags.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{task.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </div>
                        {task.blockers_count > 0 && (
                          <Badge variant="destructive">
                            {task.blockers_count} blocker(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${getStatusColor(
                          task.status
                        )}`}
                      />
                      <span className="text-sm font-medium">
                        {(() => {
                          const { isOverdue } = getTaskOverdueInfo(task);
                          return isOverdue
                            ? "Delayed"
                            : task.status.charAt(0).toUpperCase() +
                                task.status.slice(1).replace("_", " ");
                        })()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <CompactTaskAssignments
                        assignments={task.assignments || []}
                        maxVisible={2}
                        className="text-sm text-muted-foreground"
                      />
                      <div className="text-sm text-muted-foreground">
                        Last update:{" "}
                        {new Date(task.updated_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>
                          {task.status === "completed"
                            ? "100"
                            : Math.min(
                                Math.round(
                                  (task.logged_effort_hours /
                                    task.estimated_effort_hours) *
                                    100
                                ),
                                99
                              )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={
                          task.status === "completed"
                            ? 100
                            : Math.min(
                                (task.logged_effort_hours /
                                  task.estimated_effort_hours) *
                                  100,
                                99
                              )
                        }
                        className="h-1"
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="text-sm text-muted-foreground">
                        Effort: {task.logged_effort_hours}h /{" "}
                        {task.estimated_effort_hours}h
                      </div>
                      <Button
                        onClick={() =>
                          navigate(
                            `/dashboard/${user?.role}/sprints/${sprintId}/task/${task.id}`
                          )
                        }
                        variant="outline"
                        size="sm"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Team Performance</h2>
          </div>

          <div className="grid gap-6">
            {isMembersLoading ? (
              <LoadingSpinner />
            ) : isMembersError ? (
              <div className="max-w-sm mx-auto">
                <p className="text-red-500 text-center">
                  Something went wrong while fetching team members.
                </p>
              </div>
            ) : (
              filteredTeamMembers.map((member: any) => (
                <Card key={member.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4 flex-wrap-reverse">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage
                            className="object-cover"
                            src={
                              `${import.meta.env.VITE_R2_BASE_URL}${
                                member.avatar_url
                              }` || "/placeholder.svg"
                            }
                          />
                          <AvatarFallback>
                            {member.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-lg">
                            {member.name}
                          </CardTitle>
                          <CardDescription>
                            Last active: {member.lastActive}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={member.onTrack ? "default" : "destructive"}
                        >
                          {member.onTrack ? "On Track" : "Behind"}
                        </Badge>
                        <div
                          className={`w-3 h-3 rounded-full ${
                            member.onTrack ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {member.activeTasks}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Active Tasks
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {member.completedTasks}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Completed
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {member.loggedHours}h
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Logged Hours
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {member.productivity_score}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Productivity Score
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTeamMember(member);
                          setShowTaskBreakdownDialog(true);
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-6">
          {/* Team Member Notifications */}
          {user?.role === "team_member" && <AlertsComponent />}

          {/* Manager's Delay Alerts & Issues */}
          {user?.role !== "team_member" && (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-2xl font-bold">Delay Alerts & Issues</h2>
                <div className="flex gap-2">
                  <Badge variant="destructive">
                    {overdueTasks.length} active alerts
                  </Badge>
                  {Object.values(reminderCounts).reduce(
                    (sum: number, item: any) =>
                      sum + (item.reminder_count || 0),
                    0
                  ) > 0 && (
                    <Badge variant="outline">
                      {Object.values(reminderCounts).reduce(
                        (sum: number, item: any) =>
                          sum + (item.reminder_count || 0),
                        0
                      )}{" "}
                      total reminders sent
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                {overdueTasks.length > 0 ? (
                  overdueTasks.map((task) => {
                    const overdueDays = getOverdueDays(task.due_date);
                    const severity = getSeverity(overdueDays);
                    const reminderCount =
                      reminderCounts[task.id]?.reminder_count || 0;
                    const isFrequentlyReminded = reminderCount >= 3;

                    return (
                      <Card
                        key={task.id}
                        className={`border-l-4 ${
                          isFrequentlyReminded
                            ? "border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10"
                            : "border-l-destructive"
                        }`}
                      >
                        <CardHeader>
                          <div className="flex items-center justify-between gap-4 flex-wrap-reverse">
                            <div className="space-y-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <AlertTriangle
                                  className={`h-5 w-5 ${
                                    isFrequentlyReminded
                                      ? "text-orange-600"
                                      : "text-destructive"
                                  }`}
                                />
                                {isFrequentlyReminded
                                  ? "Task Overdue (Frequently Reminded)"
                                  : "Task Overdue"}
                              </CardTitle>
                              <CardDescription>
                                Task: {task.title} • Assignee:{" "}
                                <CompactTaskAssignments
                                  assignments={task.assignments || []}
                                  maxVisible={1}
                                  className="inline"
                                />
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant={getSeverityColor(severity)}>
                                {severity.toUpperCase()}
                              </Badge>
                              {isFrequentlyReminded && (
                                <Badge
                                  variant="outline"
                                  className="text-orange-600 border-orange-600"
                                >
                                  {reminderCount}+ REMINDERS
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">
                                Overdue by:{" "}
                                <span className="font-medium text-destructive">
                                  {overdueDays}{" "}
                                  {overdueDays === 1 ? "day" : "days"}
                                </span>
                              </div>
                              {reminderCounts[task.id] &&
                                reminderCounts[task.id].reminder_count > 0 && (
                                  <div className="text-sm text-muted-foreground">
                                    <span className="font-medium">
                                      {reminderCounts[task.id].reminder_count}{" "}
                                      reminder
                                      {reminderCounts[task.id].reminder_count >
                                      1
                                        ? "s"
                                        : ""}{" "}
                                      sent
                                    </span>
                                    {reminderCounts[task.id]
                                      .last_reminder_sent && (
                                      <div className="text-xs">
                                        Last:{" "}
                                        {new Date(
                                          reminderCounts[
                                            task.id
                                          ].last_reminder_sent
                                        ).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSendReminder(task.id)}
                                disabled={sendReminderMutation.isPending}
                              >
                                {sendReminderMutation.isPending
                                  ? "Sending..."
                                  : "Send Reminder"}
                              </Button>
                              {/* <Button size="sm">Resolve</Button> */}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <div className="text-muted-foreground">
                        No overdue tasks found. All tasks are on track! 🎉
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}

          {/* <Card>
            <CardHeader>
              <CardTitle>Risk Assessment</CardTitle>
              <CardDescription>
                Potential risks and mitigation strategies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-yellow-800 dark:text-yellow-200">
                      Sprint Completion Risk: Medium
                    </div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      Current velocity suggests 85% completion probability.
                      Consider task prioritization.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-red-800 dark:text-red-200">
                      Blocked Tasks: High Priority
                    </div>
                    <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                      1 high-priority task blocked for 6+ hours. Immediate
                      attention required.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card> */}
        </TabsContent>
      </Tabs>

      {/* Team Member Task Breakdown Dialog */}
      <TeamMemberTaskBreakdownDialog
        open={showTaskBreakdownDialog}
        onOpenChange={setShowTaskBreakdownDialog}
        teamMember={selectedTeamMember}
        sprintId={sprintId}
      />
    </div>
  );
}
