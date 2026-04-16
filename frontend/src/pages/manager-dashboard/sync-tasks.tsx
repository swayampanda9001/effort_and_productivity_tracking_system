import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Papa from "papaparse";
import API from "@/lib/axios/instance";
import { useSprintStore } from "@/lib/zustand/sprints";
import ManualTaskDialog from "@/components/dialogs/ManualTaskDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  ExternalLink,
  RefreshCw,
  Users,
  Check,
  Download,
} from "lucide-react";

export default function SyncTasksPage() {
  const queryClient = useQueryClient();
  const { sprints } = useSprintStore();
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [showManualTaskDialog, setShowManualTaskDialog] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<string>("");
  const [taskAssignments, setTaskAssignments] = useState<
    Record<string, string>
  >({});
  const [taskModifications, setTaskModifications] = useState<
    Record<string, { estimated_hours?: number; due_date?: string }>
  >({});

  // Fetch backlog tasks (sprint_id is null)
  const {
    data: backlogTasks = [],
    isLoading: isLoadingBacklog,
    refetch: refetchBacklog,
  } = useQuery({
    queryKey: ["backlog-tasks"],
    queryFn: async () => {
      const response = await API.get("/tasks/?sprint_id=null");
      console.log("Fetched backlog tasks:", response.data);
      return response.data;
    },
  });

  // Get team members for selected sprint from sprint data
  const sprintMembers = selectedSprint
    ? sprints.find((sprint) => sprint.id.toString() === selectedSprint)
        ?.sprint_members || []
    : [];

  // Add tasks to sprint mutation
  const syncTasksMutation = useMutation({
    mutationFn: async (tasksData: any[]) => {
      const promises = tasksData.map((task) =>
        API.put(`/tasks/${task.id}`, {
          sprint_id: parseInt(selectedSprint),
          assigned_to:
            taskAssignments[task.id] &&
            taskAssignments[task.id] !== "unassigned"
              ? parseInt(taskAssignments[task.id])
              : null,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["backlog-tasks"] });
      setIsSyncDialogOpen(false);
      setSelectedTasks([]);
      setSelectedSprint("");
      setTaskAssignments({});
      setTaskModifications({});
      toast.success(`Successfully added ${data.length} task(s) to sprint`);
    },
    onError: (error: any) => {
      console.error("Error adding tasks to sprint:", error);
      const errorMessage =
        error.response?.data?.detail || "Failed to add tasks to sprint";
      toast.error(errorMessage);
    },
  });

  // Handle refreshing backlog tasks
  const handleRefreshTasks = async () => {
    refetchBacklog();
  };

  // Handle exporting tasks to Excel
  const handleExportTasks = () => {
    if (backlogTasks.length === 0) {
      toast.error("No tasks to export");
      return;
    }

    // Prepare data for export
    // Prepare data for export
    const dataForExport = backlogTasks.map((task: any) => ({
      ID: task.id,
      Title: task.title,
      Description: task.description,
      Priority: task.priority,
      Status: task.status,
      Stage: task.stage,
      "Estimated Hours": task.estimated_effort_hours,
      "Due Date": task.due_date,
      "Start Date": task.start_date || "",
      Tags: task.tags ? task.tags.join(", ") : "",
      Assignee: task.assigned_to_name || "Unassigned",
    }));

    // Convert to CSV using PapaParse
    const csv = Papa.unparse(dataForExport);

    // Create blob and download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `external-tasks-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Tasks exported successfully");
  };

  const handleTaskSelection = (taskId: string, checked: boolean) => {
    if (checked) {
      setSelectedTasks([...selectedTasks, taskId]);
    } else {
      setSelectedTasks(selectedTasks.filter((id) => id !== taskId));
      // Remove assignment and modifications if task is deselected
      const newAssignments = { ...taskAssignments };
      delete newAssignments[taskId];
      setTaskAssignments(newAssignments);

      const newModifications = { ...taskModifications };
      delete newModifications[taskId];
      setTaskModifications(newModifications);
    }
  };

  const handleTaskAssignment = (taskId: string, memberId: string) => {
    setTaskAssignments({
      ...taskAssignments,
      [taskId]: memberId,
    });
  };

  const handleTaskModification = (
    taskId: string,
    field: "estimated_hours" | "due_date",
    value: string | number
  ) => {
    setTaskModifications({
      ...taskModifications,
      [taskId]: {
        ...taskModifications[taskId],
        [field]: value,
      },
    });
  };

  const getModifiedTask = (task: any) => {
    const modifications = taskModifications[task.id] || {};
    return {
      ...task,
      estimated_effort_hours:
        modifications.estimated_hours ?? task.estimated_effort_hours,
      due_date: modifications.due_date ?? task.due_date,
    };
  };

  const handleSyncTasks = () => {
    const tasksToSync = backlogTasks
      .filter((task: any) => selectedTasks.includes(task.id))
      .map((task: any) => getModifiedTask(task));
    syncTasksMutation.mutate(tasksToSync);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "to do":
        return "secondary";
      case "in progress":
        return "default";
      case "done":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Project Backlog</h1>
        <p className="text-muted-foreground mt-2">
          Import and manage project backlog from external systems like Jira.
        </p>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between">
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={handleRefreshTasks}
            disabled={isLoadingBacklog}
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                isLoadingBacklog ? "animate-spin" : ""
              }`}
            />
            {isLoadingBacklog ? "Refreshing..." : "Refresh Tasks"}
          </Button>

          <ManualTaskDialog
            open={showManualTaskDialog}
            onOpenChange={setShowManualTaskDialog}
            onTaskCreated={() => {
              // Optionally refresh backlog tasks after creating a manual task
              refetchBacklog();
            }}
          />

          {/* <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={selectedTasks.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Assign {selectedTasks.length} Task
                {selectedTasks.length !== 1 ? "s" : ""}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Sync Tasks to Sprint</DialogTitle>
                <DialogDescription>
                  Select a sprint and assign team members to the selected tasks.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sprint">Select Sprint</Label>
                  <Select
                    value={selectedSprint}
                    onValueChange={setSelectedSprint}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a sprint" />
                    </SelectTrigger>
                    <SelectContent>
                      {sprints
                        .filter((sprint: any) => sprint.status !== "cancelled")
                        .map((sprint: any) => (
                          <SelectItem
                            key={sprint.id}
                            value={sprint.id.toString()}
                          >
                            {sprint.name} ({sprint.status})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSprint && (
                  <div className="space-y-4">
                    <Label>Assign Tasks to Team Members</Label>
                    <div className="max-h-60 overflow-y-auto space-y-3">
                      {selectedTasks.map((taskId) => {
                        const task = backlogTasks.find(
                          (t: any) => t.id === taskId
                        );
                        if (!task) return null;

                        const modifiedTask = getModifiedTask(task);

                        return (
                          <div key={taskId} className="border rounded-lg p-3">
                            <div className="flex items-start justify-between mb-3">
                              <h4 className="font-medium text-sm">
                                {task.title}
                              </h4>
                              <Badge variant={getPriorityColor(task.priority)}>
                                {task.priority}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  Estimated Hours
                                </Label>
                                <Input
                                  type="number"
                                  value={modifiedTask.estimated_hours}
                                  onChange={(e) =>
                                    handleTaskModification(
                                      taskId,
                                      "estimated_hours",
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="h-8 text-xs"
                                  min="0"
                                  step="0.5"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Due Date</Label>
                                <Input
                                  type="date"
                                  value={modifiedTask.due_date}
                                  onChange={(e) =>
                                    handleTaskModification(
                                      taskId,
                                      "due_date",
                                      e.target.value
                                    )
                                  }
                                  className="h-8 text-xs bg-slate-300 text-black"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">
                                Assign to Team Member
                              </Label>
                              <Select
                                value={taskAssignments[taskId] || "unassigned"}
                                onValueChange={(value) =>
                                  handleTaskAssignment(taskId, value)
                                }
                              >
                                <SelectTrigger className="w-full h-8">
                                  <SelectValue placeholder="Assign to team member" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">
                                    Unassigned
                                  </SelectItem>
                                  {sprintMembers.map((member: any) => (
                                    <SelectItem
                                      key={member.team_member_id}
                                      value={member.team_member_id.toString()}
                                    >
                                      {member.team_member_name} ({member.role})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsSyncDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSyncTasks}
                  disabled={!selectedSprint || syncTasksMutation.isPending}
                >
                  {syncTasksMutation.isPending ? "Syncing..." : "Sync Tasks"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog> */}
        </div>

        <Button
          onClick={handleExportTasks}
          disabled={backlogTasks.length === 0}
          variant="outline"
          className="bg-green-500"
        >
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <ExternalLink className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Total Backlog Tasks
                </p>
                <p className="text-2xl font-bold">{backlogTasks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Check className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Selected
                </p>
                <p className="text-2xl font-bold">{selectedTasks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Unassigned
                </p>
                <p className="text-2xl font-bold">
                  {backlogTasks.filter((t: any) => !t.assigned_to).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">
                  High Priority
                </p>
                <p className="text-2xl font-bold">
                  {
                    backlogTasks.filter((t: any) => t.priority === "high")
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* External Tasks List */}
      <Card>
        <CardHeader className="px-4">
          <CardTitle>Backlog Tasks</CardTitle>
          <CardDescription>
            Tasks in your project backlog ready to be added to sprints
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <div className="space-y-4">
            {backlogTasks.map((task: any) => {
              const isModified = taskModifications[task.id];
              const modifiedTask = getModifiedTask(task);

              return (
                <div
                  key={task.id}
                  className="border rounded-lg px-3 py-4 sm:p-4"
                >
                  <div className="flex items-start gap-4 flex-col sm:flex-row">
                    <input
                      type="checkbox"
                      checked={selectedTasks.includes(task.id)}
                      onChange={(e) =>
                        handleTaskSelection(task.id, e.target.checked)
                      }
                      className="mt-1"
                    />

                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{task.title}</h3>
                            <Badge variant="outline" className="text-xs">
                              #{task.id}
                            </Badge>
                            <Badge variant={getPriorityColor(task.priority)}>
                              {task.priority}
                            </Badge>
                            <Badge variant={getStatusColor(task.status)}>
                              {task.status}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {task.stage}
                            </Badge>
                            {isModified && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-blue-100 text-blue-800"
                              >
                                Modified
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {task.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span
                            className={
                              isModified?.estimated_hours !== undefined
                                ? "font-medium text-blue-600"
                                : ""
                            }
                          >
                            {modifiedTask.estimated_effort_hours}h estimated
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span
                            className={
                              isModified?.due_date !== undefined
                                ? "font-medium text-blue-600"
                                : ""
                            }
                          >
                            Due:{" "}
                            {new Date(
                              modifiedTask.due_date
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {task.tags && task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
