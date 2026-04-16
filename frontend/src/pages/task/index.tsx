import type React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "react-router-dom";
import API from "@/lib/axios/instance";
import type { CommentResponse } from "@/types/comment";
import LogEffortDialog from "@/components/dialogs/LogEffortDialog";
import EditTaskDialog from "@/components/dialogs/EditTaskDialog";
import { AssignMultipleUsersDialog } from "@/components/dialogs/AssignMultipleUsers";
import { TaskAssignmentsDisplay } from "@/components/TaskAssignmentsDisplay";
import {
  canModifyTask,
  getTaskModificationRestrictionReason,
  canLogEffort,
  getEffortLoggingRestrictionReason,
} from "@/utils/taskUtils";
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
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Calendar,
  Clock,
  User,
  MessageSquare,
  Plus,
  Edit,
  UserPlus,
} from "lucide-react";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectContent,
  SelectValue,
} from "@/components/ui/select";

export default function TaskDetailsPage() {
  const { user } = useAuth();
  const { taskId } = useParams<{ taskId: string }>();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedTab, setSelectedTab] = useState(
    searchParams.get("tab") || "overview"
  );
  const [isLogEffortDialogOpen, setIsLogEffortDialogOpen] = useState(false);
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  const [isAssignMultipleUsersDialogOpen, setIsAssignMultipleUsersDialogOpen] =
    useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState("general");

  // Helper function to check if task is overdue and calculate overdue days
  const getOverdueInfo = (task: any) => {
    if (!task || task.status !== "in_progress" || !task.due_date) {
      return { isOverdue: false, overdueDays: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison

    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);

    const isOverdue = dueDate < today;
    const overdueDays = isOverdue
      ? Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return { isOverdue, overdueDays };
  };

  // Fetch task data from API
  const fetchTaskData = async () => {
    if (!taskId) {
      throw new Error("Task ID is required");
    }
    try {
      const response = await API.get(`/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      throw new Error("Failed to fetch task data");
    }
  };

  // Fetch sprint data for this task
  const fetchSprintData = async () => {
    if (!task?.sprint_id) return null;
    try {
      const response = await API.get(`/sprints/${task.sprint_id}`);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch sprint data:", error);
      return null;
    }
  };

  // Fetch effort logs for this task
  const fetchEffortLogs = async () => {
    if (!taskId) return [];
    try {
      const response = await API.get(`/effort-logs/?task_id=${taskId}`);
      return response.data;
    } catch (error) {
      throw new Error("Failed to fetch effort logs");
    }
  };

  const fetchComments = async () => {
    if (!taskId) return;
    try {
      const response = await API.get(`/comments/task/${taskId}`);
      return response.data;
    } catch (error) {
      throw new Error("Failed to fetch comments");
    }
  };

  const {
    data: task,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["task", taskId],
    queryFn: fetchTaskData,
    enabled: !!taskId,
  });

  const { data: sprint } = useQuery({
    queryKey: ["sprint", task?.sprint_id],
    queryFn: fetchSprintData,
    enabled: !!task?.sprint_id,
  });

  const { data: effortLogs = [], isLoading: isLoadingEffortLogs } = useQuery({
    queryKey: ["effort-logs", taskId],
    queryFn: fetchEffortLogs,
    enabled: !!taskId,
  });

  const { data: comments = [], isLoading: isLoadingComments } = useQuery({
    queryKey: ["comments", taskId],
    queryFn: fetchComments,
    enabled: !!taskId,
  });

  const commentMutation = useMutation({
    mutationFn: async (commentData: {
      task_id: number;
      comment_type: string;
      comment_text: string;
    }) => {
      if (!commentData.task_id) throw new Error("Task ID is required");
      if (!commentData.comment_text.trim())
        throw new Error("Comment cannot be empty");

      const response = await API.post(`/comments/`, commentData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
      // Reset comment form
      setNewComment("");
      setCommentType("general");
      toast.success("Comment added successfully");
    },
    onError: (error: any) => {
      console.error("Error creating comment:", error);
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to add comment";
      toast.error(errorMessage);
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
      case "critical":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  // Check if task can be modified based on status and user role
  const canModify = task ? canModifyTask(task.status, user?.role || "") : false;
  const modificationRestriction =
    task && user
      ? getTaskModificationRestrictionReason(task.status, user.role)
      : null;

  // Check if effort can be logged for this task
  const canLogEffortForTask =
    task && user?.role !== "pm" ? canLogEffort(task.status) : false;
  const effortLoggingRestriction = task
    ? user?.role === "pm"
      ? "Project managers cannot log effort"
      : getEffortLoggingRestrictionReason(task.status)
    : null;

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskId || !newComment.trim()) {
      return;
    }
    const commentData = {
      task_id: parseInt(taskId),
      comment_type: commentType as any,
      comment_text: newComment.trim(),
    };
    commentMutation.mutate(commentData);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading task details...</div>
      </div>
    );
  }

  // Show error state
  if (isError || !task) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-red-500">
          Error loading task: {error?.message || "Task not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        {/* <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>Tasks</span>
          <ArrowRight className="h-4 w-4" />
          <span>Task #{task.id}</span>
        </div> */}
        <h1 className="text-3xl font-bold text-foreground">{task.title}</h1>
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <Badge variant={getPriorityColor(task.priority)}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}{" "}
            Complexity
          </Badge>
          <Badge variant="outline">
            {task.status.charAt(0).toUpperCase() +
              task.status.slice(1).replace("_", " ")}
          </Badge>
          {/* Overdue Badge */}
          {(() => {
            const { isOverdue, overdueDays } = getOverdueInfo(task);
            return isOverdue ? (
              <Badge variant="destructive">
                Overdue by {overdueDays} {overdueDays === 1 ? "day" : "days"}
              </Badge>
            ) : null;
          })()}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Due: {new Date(task.due_date).toLocaleDateString()}
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-1 text-sm text-muted-foreground mt-4">
          {/* <User className="h-4 w-4" /> */}
          {task.assignments && task.assignments.length > 0 ? (
            <TaskAssignmentsDisplay
              assignments={task.assignments}
              showCard={false}
              className="flex-1"
            />
          ) : (
            <span className="text-orange-600 font-medium">
              Unassigned
              {user?.role === "pm" && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (Click assign button to assign)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Task Modification Restriction Notice */}
      {modificationRestriction && (
        <div className="mb-6 p-4 bg-muted border border-muted-foreground/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Edit className="h-4 w-4" />
            <span>{modificationRestriction}</span>
          </div>
        </div>
      )}

      {/* Unassigned Task Notice */}
      {(!task.assignments || task.assignments.length === 0) && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-orange-800">
              <UserPlus className="h-4 w-4" />
              <span>This task is not assigned to any team member yet.</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-100"
                onClick={() => setIsAssignMultipleUsersDialogOpen(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Users
              </Button>
            </div>
          </div>
        </div>
      )}

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="effort">Effort Logs</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Task Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {task.description || "No description available."}
                  </p>
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex gap-2 mt-4">
                      {task.tags.map((tag: string, index: number) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Progress Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      Overall Progress
                    </span>
                    <span className="text-sm text-muted-foreground">
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
                            Math.round(
                              (task.logged_effort_hours /
                                task.estimated_effort_hours) *
                                100
                            ),
                            99
                          )
                    }
                  />

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">
                        {task.status === "completed"
                          ? task.actual_effort_hours
                          : task.logged_effort_hours}
                        h
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {task.status === "completed"
                          ? "Actual Effort"
                          : "Logged Efforts"}
                      </div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-muted-foreground">
                        {task.estimated_effort_hours}h
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Estimated Effort
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Task Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Status
                    </span>
                    <Badge variant="outline">
                      {task.status.charAt(0).toUpperCase() +
                        task.status.slice(1).replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Complexity
                    </span>
                    <Badge variant={getPriorityColor(task.priority)}>
                      {task.priority.charAt(0).toUpperCase() +
                        task.priority.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Current Stage
                    </span>
                    <span className="text-sm font-medium">
                      {task.stage.charAt(0).toUpperCase() + task.stage.slice(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Created
                    </span>
                    <span className="text-sm">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Due Date
                    </span>
                    <span className="text-sm">
                      {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Overdue Information */}
                  {(() => {
                    const { isOverdue, overdueDays } = getOverdueInfo(task);
                    return isOverdue ? (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">
                          Overdue Status
                        </span>
                        <Badge variant="destructive" className="text-xs">
                          {overdueDays} {overdueDays === 1 ? "day" : "days"}{" "}
                          overdue
                        </Badge>
                      </div>
                    ) : null;
                  })()}
                  {task.start_date && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Started
                      </span>
                      <span className="text-sm">
                        {new Date(task.start_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {task.completion_date && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Completed
                      </span>
                      <span className="text-sm">
                        {new Date(task.completion_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {task.blockers_count > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Blockers
                      </span>
                      <Badge variant="destructive">{task.blockers_count}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {canLogEffortForTask && user?.role === "team_member" && (
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => setIsLogEffortDialogOpen(true)}
                      disabled={!canLogEffortForTask}
                      title={effortLoggingRestriction || undefined}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Log Effort
                    </Button>
                  )}
                  {/* Show manage assignments button for all users */}
                  {user?.role !== "team_member" && (
                    <Button
                      variant="outline"
                      className="w-full bg-transparent"
                      size="sm"
                      onClick={() => setIsAssignMultipleUsersDialogOpen(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Manage Assignments
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="effort" className="space-y-6">
          <div className="flex justify-between items-center mb-4">
            <div></div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditTaskDialogOpen(true)}
                disabled={!canModify}
                title={modificationRestriction || undefined}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Task
              </Button>
              {/* Show manage assignments button for all users */}
              {/* {user?.role !== "team_member" && (
                <Button
                  variant="outline"
                  onClick={() => setIsAssignMultipleUsersDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Manage Assignments
                </Button>
              )} */}

              {user?.role === "team_member" && (
                <Button
                  onClick={() => setIsLogEffortDialogOpen(true)}
                  disabled={!canLogEffortForTask}
                  title={effortLoggingRestriction || undefined}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Log New Effort
                </Button>
              )}
            </div>
          </div>

          <Card data-testid="effort-history">
            <CardHeader>
              <CardTitle>Effort History</CardTitle>
              <CardDescription>
                Previous effort logs for this task
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoadingEffortLogs ? (
                  <div className="text-center text-muted-foreground">
                    Loading effort logs...
                  </div>
                ) : effortLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground">
                    No effort logs yet. Create your first one above!
                  </div>
                ) : (
                  effortLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {new Date(log.log_date).toLocaleDateString()}
                          </span>
                          <Badge variant="outline">
                            {log.stage.charAt(0).toUpperCase() +
                              log.stage.slice(1)}
                          </Badge>
                          {/* {!log.is_approved && (
                            <Badge variant="secondary" className="text-xs">
                              Pending Approval
                            </Badge>
                          )} */}
                        </div>
                        <span className="text-sm font-medium">
                          Logged Hours : {log.time_spent_hours}h
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">
                            Update:{" "}
                          </span>
                          <span className="text-sm">{log.daily_update}</span>
                        </div>
                        {log.blockers && (
                          <div>
                            <span className="text-sm font-medium text-muted-foreground">
                              Blockers:{" "}
                            </span>
                            <span className="text-sm text-destructive">
                              {log.blockers}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">
                            Next Day:{" "}
                          </span>
                          <span className="text-sm">{log.next_day_plan}</span>
                        </div>
                        {log.is_approved && log.approved_by && (
                          <div className="text-xs text-green-600 mt-2">
                            ✓ Approved on{" "}
                            {new Date(log.approved_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Comment</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCommentSubmit} className="space-y-4">
                <Select
                  value={commentType}
                  onValueChange={(value) => setCommentType(value)}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Select comment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="feedback">Feedback</SelectItem>
                    <SelectItem value="question">Question</SelectItem>
                    <SelectItem value="blocker">Blocker</SelectItem>
                    <SelectItem value="suggestion">Suggestion</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Add your comment or feedback..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  required
                  minLength={1}
                />
                <Button
                  type="submit"
                  disabled={commentMutation.isPending || !newComment.trim()}
                >
                  {commentMutation.isPending ? "Posting..." : "Post Comment"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comments & Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoadingComments ? (
                  <div className="text-center text-muted-foreground">
                    Loading comments...
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center text-muted-foreground">
                    No comments yet. Be the first to add one!
                  </div>
                ) : (
                  comments.map((comment: CommentResponse) => (
                    <div key={comment.id} className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            className="object-cover"
                            src={
                              `${import.meta.env.VITE_R2_BASE_URL}${
                                comment.avatar_url
                              }` || "/placeholder.svg"
                            }
                          />
                          <AvatarFallback>
                            {comment.author_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {comment.author_name || "Unknown User"}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {comment.comment_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(
                                comment.created_at
                              ).toLocaleDateString()}{" "}
                              {new Date(comment.created_at).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </span>
                          </div>
                          <p className="text-sm">{comment.comment_text}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Effort Dialog */}
      {user?.role !== "pm" && taskId && (sprint || task) && (
        <LogEffortDialog
          isOpen={isLogEffortDialogOpen}
          onOpenChange={setIsLogEffortDialogOpen}
          taskId={taskId}
          task={task}
          sprint={
            sprint || {
              created_at: task.created_at,
              start_date: task.created_at,
              end_date: undefined,
            }
          }
          onSuccess={() => {
            setSelectedTab("effort");
          }}
        />
      )}

      {/* Edit Task Dialog */}
      {taskId && (
        <EditTaskDialog
          isOpen={isEditTaskDialogOpen}
          onOpenChange={setIsEditTaskDialogOpen}
          taskId={taskId}
          currentStatus={task.status}
          currentStage={task.stage}
          currentEstimatedHours={task.estimated_effort_hours}
        />
      )}

      {/* Assign Multiple Users Dialog */}
      {taskId && task && (
        <AssignMultipleUsersDialog
          isOpen={isAssignMultipleUsersDialogOpen}
          onOpenChange={setIsAssignMultipleUsersDialogOpen}
          taskId={taskId}
          taskTitle={task.title}
          sprintId={task.sprint_id}
          currentAssignments={task.assignments || []}
          onSuccess={() => {
            // Refresh task data to show updated assignments
            queryClient.invalidateQueries({ queryKey: ["task", taskId] });
          }}
        />
      )}
    </div>
  );
}
