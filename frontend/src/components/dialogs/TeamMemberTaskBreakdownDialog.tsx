import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import API from "@/lib/axios/instance";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, TrendingUp, Calendar } from "lucide-react";
import type { TeamMember } from "@/types/user";

interface TaskBreakdown {
  task_id: number;
  task_title: string;
  status: string;
  priority: string;
  stage: string;
  estimated_effort_hours: number;
  logged_effort_hours: number;
  due_date: string;
  completion_date?: string;
  time_efficiency_score: number;
  completion_contribution: number;
  effort_logging_score: number;
  is_completed_on_time: boolean;
  days_difference?: number;
}

interface TeamMemberTaskBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMember: TeamMember | null;
  sprintId: string | undefined;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function TeamMemberTaskBreakdownDialog({
  open,
  onOpenChange,
  teamMember,
  sprintId,
}: TeamMemberTaskBreakdownDialogProps) {
  const [taskData, setTaskData] = useState<TaskBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && teamMember && sprintId) {
      fetchTaskBreakdown();
    }
  }, [open, teamMember, sprintId]);

  const fetchTaskBreakdown = async () => {
    if (!teamMember || !sprintId) return;
    console.log("Fetching task breakdown for:", teamMember, sprintId);
    setIsLoading(true);
    try {
      const response = await API.get(
        `/team-members/${teamMember.user_id}/sprint/${sprintId}/task-breakdown`
      );
      console.log("Task breakdown data:", response.data);
      setTaskData(response.data);
    } catch (error) {
      console.error("Error fetching task breakdown:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate statistics
  const completedTasks = taskData.filter((t) => t.status === "completed");
  const onTimeTasks = completedTasks.filter((t) => t.is_completed_on_time);
  const totalLoggedHours = taskData.reduce(
    (sum, t) => sum + t.logged_effort_hours,
    0
  );
  const totalEstimatedHours = taskData.reduce(
    (sum, t) => sum + t.estimated_effort_hours,
    0
  );
  const avgTimeEfficiency =
    taskData.length > 0
      ? taskData.reduce((sum, t) => sum + t.time_efficiency_score, 0) /
        taskData.length
      : 0;

  // Chart data for task completion contribution
  const completionChartData = taskData
    .filter((t) => t.completion_contribution > 0)
    .map((task) => ({
      name:
        task.task_title.length > 20
          ? task.task_title.substring(0, 20) + "..."
          : task.task_title,
      contribution: Math.round(task.completion_contribution * 100) / 100,
      status: task.status,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10);

  // Pie chart data for task status
  const statusData = Object.entries(
    taskData.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1).replace("_", " "),
    value: count,
  }));

  // Time efficiency chart data
  const timeEfficiencyData = taskData
    .filter((t) => t.status === "completed")
    .map((task) => ({
      name:
        task.task_title.length > 15
          ? task.task_title.substring(0, 15) + "..."
          : task.task_title,
      estimated: task.estimated_effort_hours,
      logged: task.logged_effort_hours,
      efficiency: Math.round(task.time_efficiency_score),
    }))
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage
                className="object-cover"
                src={
                  teamMember?.avatar_url
                    ? `${import.meta.env.VITE_R2_BASE_URL}${
                        teamMember.avatar_url
                      }`
                    : "/placeholder.svg"
                }
              />
              <AvatarFallback>
                {teamMember?.full_name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-xl">{teamMember?.full_name}</div>
              <div className="text-sm font-normal text-muted-foreground">
                {teamMember?.email}
              </div>
            </div>
            <Badge className="ml-auto" variant="default">
              Sprint Productivity: {teamMember?.productivity_score || 0}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Task-level productivity breakdown and performance analysis
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p>Loading task breakdown...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Total Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{taskData.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {completedTasks.length} completed
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    On-Time Delivery
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {completedTasks.length > 0
                      ? Math.round(
                          (onTimeTasks.length / completedTasks.length) * 100
                        )
                      : 0}
                    %
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {onTimeTasks.length} of {completedTasks.length} on time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Effort Logged
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(totalLoggedHours)}h
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    of {Math.round(totalEstimatedHours)}h estimated
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Avg Efficiency
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(avgTimeEfficiency)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    time efficiency score
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            {taskData.length > 0 ? (
              <Tabs defaultValue="completion" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="completion">
                    Completion Impact
                  </TabsTrigger>
                  <TabsTrigger value="efficiency">Time Efficiency</TabsTrigger>
                  <TabsTrigger value="overview">Status Overview</TabsTrigger>
                </TabsList>

                <TabsContent value="completion" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Task Completion Contribution</CardTitle>
                      <DialogDescription>
                        How much each completed task contributed to productivity
                        score
                      </DialogDescription>
                    </CardHeader>
                    <CardContent>
                      {completionChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart data={completionChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              angle={-45}
                              textAnchor="end"
                              height={120}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar
                              dataKey="contribution"
                              fill="#3b82f6"
                              name="Contribution Score"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          No completed tasks yet
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="efficiency" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Time Efficiency Analysis</CardTitle>
                      <DialogDescription>
                        Estimated vs actual time spent on completed tasks
                      </DialogDescription>
                    </CardHeader>
                    <CardContent>
                      {timeEfficiencyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart data={timeEfficiencyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              angle={-45}
                              textAnchor="end"
                              height={120}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar
                              dataKey="estimated"
                              fill="#10b981"
                              name="Estimated Hours"
                            />
                            <Bar
                              dataKey="logged"
                              fill="#3b82f6"
                              name="Logged Hours"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          No completed tasks to analyze
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="overview" className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Task Status Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={statusData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(entry: any) =>
                                `${entry.name}: ${(entry.percent * 100).toFixed(
                                  0
                                )}%`
                              }
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {statusData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Performance Metrics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Completion Rate</span>
                              <span className="font-medium">
                                {taskData.length > 0
                                  ? Math.round(
                                      (completedTasks.length /
                                        taskData.length) *
                                        100
                                    )
                                  : 0}
                                %
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{
                                  width: `${
                                    taskData.length > 0
                                      ? (completedTasks.length /
                                          taskData.length) *
                                        100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Effort Utilization</span>
                              <span className="font-medium">
                                {totalEstimatedHours > 0
                                  ? Math.round(
                                      (totalLoggedHours / totalEstimatedHours) *
                                        100
                                    )
                                  : 0}
                                %
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full"
                                style={{
                                  width: `${
                                    totalEstimatedHours > 0
                                      ? Math.min(
                                          (totalLoggedHours /
                                            totalEstimatedHours) *
                                            100,
                                          100
                                        )
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>On-Time Delivery</span>
                              <span className="font-medium">
                                {completedTasks.length > 0
                                  ? Math.round(
                                      (onTimeTasks.length /
                                        completedTasks.length) *
                                        100
                                    )
                                  : 0}
                                %
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-purple-500 h-2 rounded-full"
                                style={{
                                  width: `${
                                    completedTasks.length > 0
                                      ? (onTimeTasks.length /
                                          completedTasks.length) *
                                        100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-2">
                      No Tasks Found
                    </h3>
                    <p className="text-muted-foreground">
                      This team member hasn't been assigned any tasks in this
                      sprint yet.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detailed Task List */}
            {taskData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Task Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Task</th>
                          <th className="text-center p-2">Status</th>
                          <th className="text-center p-2">Complexity</th>
                          <th className="text-center p-2">Effort</th>
                          <th className="text-center p-2">Efficiency</th>
                          <th className="text-center p-2">On Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taskData.map((task) => (
                          <tr
                            key={task.task_id}
                            className="border-b hover:bg-muted/50"
                          >
                            <td className="p-2">
                              <div className="font-medium">
                                {task.task_title}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Due:{" "}
                                {new Date(task.due_date).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <Badge
                                variant={
                                  task.status === "completed"
                                    ? "default"
                                    : task.status === "in_progress"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {task.status.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">
                              <Badge
                                variant={
                                  task.priority === "high"
                                    ? "destructive"
                                    : task.priority === "medium"
                                    ? "default"
                                    : "outline"
                                }
                              >
                                {task.priority}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">
                              <div className="text-sm">
                                {task.logged_effort_hours}h /{" "}
                                {task.estimated_effort_hours}h
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <div
                                className={`font-semibold ${
                                  task.time_efficiency_score >= 80
                                    ? "text-green-600"
                                    : task.time_efficiency_score >= 60
                                    ? "text-yellow-600"
                                    : "text-red-600"
                                }`}
                              >
                                {Math.round(task.time_efficiency_score)}
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              {task.status === "completed" ? (
                                task.is_completed_on_time ? (
                                  <Badge
                                    variant="default"
                                    className="bg-green-500"
                                  >
                                    ✓
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    {task.days_difference
                                      ? `+${task.days_difference}d`
                                      : "✗"}
                                  </Badge>
                                )
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
