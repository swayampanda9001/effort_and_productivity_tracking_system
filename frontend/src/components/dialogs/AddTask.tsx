import React, { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, UserPlus, Users, FileDown, Search } from "lucide-react";
import {
  getAssignmentTypeColor,
  getAssignmentTypeLabel,
} from "@/components/TaskAssignmentsDisplay";

interface TeamMember {
  id: number;
  name: string;
  email?: string;
  active_tasks?: number;
}

interface Assignment {
  team_member_id: string;
  assignment_type: string;
}

interface UnassignedTask {
  id: number;
  title: string;
  description?: string;
  priority: string;
  estimated_effort_hours: number;
  start_date: string;
  due_date: string;
  stage: string;
  tags?: string[];
  sprint_id?: number;
}

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers?: TeamMember[];
  sprintName?: string;
  sprintDuration?: number;
  sprintStartDate?: string;
  sprintEndDate?: string;
  onTaskCreated?: (taskData: any) => void;
}

function AddTaskDialog({
  open,
  onOpenChange,
  teamMembers = [],
  sprintName = "Current Sprint",
  sprintDuration,
  sprintStartDate,
  sprintEndDate,
  onTaskCreated,
}: AddTaskDialogProps) {
  const { sprintId } = useParams<{ sprintId: string }>();
  // Helper functions for date handling
  const formatDateForInput = (dateStr: string) => {
    return new Date(dateStr).toISOString().split("T")[0];
  };

  const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  // Internal state for new task data
  const [newTaskData, setNewTaskData] = useState({
    title: "",
    description: "",
    priority: "",
    estimated_effort_hours: "",
    start_date: getTodayDate(),
    due_date: getTodayDate(),
    stage: "",
    tags: "",
  });
  const [assignments, setAssignments] = useState<Assignment[]>([
    { team_member_id: "", assignment_type: "developer" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnassignedTasks, setShowUnassignedTasks] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUnassignedTaskId, setSelectedUnassignedTaskId] = useState<
    number | null
  >(null);

  // Fetch unassigned tasks (backlog tasks without sprint assignment)
  const { data: unassignedTasks = [], isLoading: isLoadingUnassigned } =
    useQuery({
      queryKey: ["unassigned-tasks", sprintId],
      queryFn: async () => {
        const response = await API.get("/tasks/?sprint_id=null");
        return response.data;
      },
      enabled: open && showUnassignedTasks,
    });

  const filteredUnassignedTasks = unassignedTasks.filter(
    (task: UnassignedTask) =>
      task.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Function to load task data from unassigned task
  const loadTaskFromUnassigned = useCallback((task: UnassignedTask) => {
    setNewTaskData({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      estimated_effort_hours: task.estimated_effort_hours.toString(),
      start_date: task.start_date.split("T")[0],
      due_date: task.due_date.split("T")[0],
      stage: task.stage,
      tags: task.tags ? task.tags.join(", ") : "",
    });
    setSelectedUnassignedTaskId(task.id);
    setShowUnassignedTasks(false);
    setSearchTerm("");
  }, []);

  // Helper functions for assignment management
  const addAssignment = () => {
    setAssignments([
      ...assignments,
      { team_member_id: "", assignment_type: "tester" },
    ]);
  };

  const removeAssignment = (index: number) => {
    if (assignments.length > 1) {
      setAssignments(assignments.filter((_, i) => i !== index));
    }
  };

  const updateAssignment = (
    index: number,
    field: keyof Assignment,
    value: string
  ) => {
    const updated = [...assignments];
    updated[index][field] = value;
    setAssignments(updated);
  };

  const getAvailableTeamMembers = (currentIndex: number) => {
    return teamMembers;
  };

  // Helper function to get priority color
  const getPriorityColor = useCallback((priority: string) => {
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
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      console.log(sprintId, newTaskData);
      setIsSubmitting(true);
      try {
        // Filter valid assignments (those with both member and type selected)
        const validAssignments = assignments.filter(
          (a) => a.team_member_id && a.assignment_type
        );

        let response;

        if (selectedUnassignedTaskId) {
          // If we loaded from an unassigned task, update that task with assignments
          response = await API.post(
            `/tasks/${selectedUnassignedTaskId}/assign-from-unassigned`,
            {
              sprint_id: parseInt(sprintId || "0"),
              assignments: validAssignments,
            }
          );
          console.log(
            "Unassigned task updated with assignments:",
            response.data
          );
        } else {
          // Create a new task
          response = await API.post("/tasks", {
            sprint_id: parseInt(sprintId || "0"), // Use sprintId from URL params
            title: newTaskData.title,
            description: newTaskData.description,
            priority: newTaskData.priority,
            estimated_effort_hours: parseInt(
              newTaskData.estimated_effort_hours
            ),
            start_date: newTaskData.start_date,
            due_date: newTaskData.due_date,
            stage: newTaskData.stage,
            tags: newTaskData.tags.split(",").map((tag) => tag.trim()),
            assignments: validAssignments,
          });
          console.log("New task created:", response.data);
        }
      } catch (error) {
        console.error("Error creating/updating task:", error);
      } finally {
        setIsSubmitting(false);
      }

      // Call the callback if provided
      onTaskCreated?.(newTaskData);

      // Reset form and close dialog
      setNewTaskData({
        title: "",
        description: "",
        priority: "",
        estimated_effort_hours: "",
        start_date: getTodayDate(),
        due_date: getTodayDate(),
        stage: "Analysis",
        tags: "",
      });
      setAssignments([{ team_member_id: "", assignment_type: "developer" }]);
      setSelectedUnassignedTaskId(null);
      onOpenChange(false);
    },
    [
      newTaskData,
      assignments,
      sprintId,
      selectedUnassignedTaskId,
      onTaskCreated,
      onOpenChange,
    ]
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {/* Header Section */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-background to-muted/20">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              {selectedUnassignedTaskId ? (
                <>
                  <Users className="h-6 w-6 text-primary" />
                  Assign Team to Task
                </>
              ) : (
                <>
                  <Plus className="h-6 w-6 text-primary" />
                  Add New Task
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              {selectedUnassignedTaskId
                ? "Assign team members to this existing task and add it to the sprint"
                : `Create a new task and assign team members for ${sprintName}`}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Status Banner */}
            {selectedUnassignedTaskId && (
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 rounded-lg p-4 flex items-start gap-3 shadow-sm">
                <div className="bg-blue-500 rounded-full p-2 mt-0.5">
                  <FileDown className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 mb-1">Task Loaded from Backlog</p>
                  <p className="text-sm text-blue-700">
                    This task has been loaded from unassigned tasks. Add team assignments to complete the setup and move it to this sprint.
                  </p>
                </div>
              </div>
            )}

            {/* Load from Unassigned Tasks Section */}
            <div className="bg-muted/30 border-2 border-dashed rounded-xl p-5 space-y-4 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileDown className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold">Load from Backlog</h3>
                </div>
                <Button
                  type="button"
                  variant={showUnassignedTasks ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowUnassignedTasks(!showUnassignedTasks)}
                  className="shadow-sm"
                >
                  {showUnassignedTasks ? (
                    <>Hide Tasks</>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Browse Tasks
                    </>
                  )}
                </Button>
              </div>

              {showUnassignedTasks && (
                <div className="space-y-3 pt-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search unassigned tasks by title..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-11 bg-background shadow-sm"
                    />
                  </div>

                  {/* Tasks List */}
                  <div className="max-h-64 overflow-y-auto space-y-2 bg-background border rounded-lg p-3 shadow-inner">
                    {isLoadingUnassigned ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        <div className="animate-pulse">Loading unassigned tasks...</div>
                      </div>
                    ) : filteredUnassignedTasks.length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        {unassignedTasks.length === 0
                          ? "No unassigned tasks available"
                          : "No tasks match your search criteria"}
                      </div>
                    ) : (
                      filteredUnassignedTasks.map((task: UnassignedTask) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent hover:shadow-md cursor-pointer transition-all group"
                          onClick={() => loadTaskFromUnassigned(task)}
                        >
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                                {task.title}
                              </h4>
                              <Badge
                                variant={
                                  task.priority.toLowerCase() === "high"
                                    ? "destructive"
                                    : task.priority.toLowerCase() === "medium"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {task.priority}
                              </Badge>
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="font-medium">{task.estimated_effort_hours}h</span>
                              <span>•</span>
                              <span>
                                Due: {new Date(task.due_date).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                              <Plus className="h-3 w-3" />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    💡 Click on a task to load its details into the form below
                  </p>
                </div>
              )}
            </div>

              {/* Task Details Section */}
              <div className="bg-card border rounded-xl p-6 space-y-6 shadow-sm">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <div className="bg-primary/10 rounded-lg p-2">
                    <FileDown className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">Task Details</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Task Title */}
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="taskTitle" className="text-sm font-semibold flex items-center gap-1">
                      Task Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="taskTitle"
                      placeholder="Enter a clear and concise task title..."
                      value={newTaskData.title}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          title: e.target.value,
                        })
                      }
                      className="h-11 shadow-sm"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="taskDescription" className="text-sm font-semibold">
                      Description
                    </Label>
                    <Textarea
                      id="taskDescription"
                      placeholder="Describe the task requirements, acceptance criteria, and any important details..."
                      value={newTaskData.description}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          description: e.target.value,
                        })
                      }
                      rows={4}
                      className="resize-none shadow-sm"
                    />
                  </div>

                  {/* Dates Row */}
                  <div className="space-y-2">
                    <Label htmlFor="startDate" className="text-sm font-semibold">
                      Start Date
                    </Label>
                    <Input
                      id="startDate"
                      type="date"
                      className="h-11 shadow-sm"
                      value={newTaskData.start_date}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          start_date: e.target.value,
                        })
                      }
                      min={
                        sprintStartDate
                          ? formatDateForInput(sprintStartDate)
                          : getTodayDate()
                      }
                    />
                    {sprintStartDate && sprintEndDate && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>📅</span>
                        {new Date(sprintStartDate).toLocaleDateString()} - {new Date(sprintEndDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dueDate" className="text-sm font-semibold flex items-center gap-1">
                      Due Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="dueDate"
                      type="date"
                      className="h-11 shadow-sm"
                      value={newTaskData.due_date}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          due_date: e.target.value,
                        })
                      }
                      min={
                        sprintStartDate
                          ? formatDateForInput(sprintStartDate)
                          : getTodayDate()
                      }
                      required
                    />
                  </div>

                  {/* Effort and Stage */}
                  <div className="space-y-2">
                    <Label htmlFor="estimatedEffort" className="text-sm font-semibold flex items-center gap-1">
                      Estimated Effort (hours) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="estimatedEffort"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max={(() => {
                        if (sprintDuration) {
                          return sprintDuration * 40;
                        }
                      })()}
                      placeholder="e.g. 8"
                      value={newTaskData.estimated_effort_hours}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          estimated_effort_hours: e.target.value,
                        })
                      }
                      className="h-11 shadow-sm"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="initialStage" className="text-sm font-semibold">
                      Initial Stage
                    </Label>
                    <Select
                      value={newTaskData.stage}
                      onValueChange={(value) =>
                        setNewTaskData({ ...newTaskData, stage: value })
                      }
                    >
                      <SelectTrigger className="h-11 shadow-sm">
                        <SelectValue placeholder="Select initial stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="analysis">📋 Analysis</SelectItem>
                        <SelectItem value="development">💻 Development</SelectItem>
                        <SelectItem value="testing">🧪 Testing</SelectItem>
                        <SelectItem value="review">✅ Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Priority and Tags */}
                  <div className="space-y-2">
                    <Label htmlFor="priority" className="text-sm font-semibold flex items-center gap-1">
                      Complexity <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={newTaskData.priority}
                      onValueChange={(value) =>
                        setNewTaskData({ ...newTaskData, priority: value })
                      }
                    >
                      <SelectTrigger className="h-11 shadow-sm">
                        <SelectValue placeholder="Select complexity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">🔴 High</SelectItem>
                        <SelectItem value="medium">🟡 Medium</SelectItem>
                        <SelectItem value="low">🟢 Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tags" className="text-sm font-semibold">
                      Tags
                    </Label>
                    <Input
                      id="tags"
                      placeholder="frontend, api, authentication..."
                      value={newTaskData.tags}
                      onChange={(e) =>
                        setNewTaskData({
                          ...newTaskData,
                          tags: e.target.value,
                        })
                      }
                      className="h-11 shadow-sm"
                    />
                    <p className="text-xs text-muted-foreground">Separate tags with commas</p>
                  </div>
                </div>
              </div>

              {/* Team Assignments Section */}
              <div className="bg-card border rounded-xl p-6 space-y-5 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 rounded-lg p-2">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-1">
                        Team Assignments <span className="text-destructive">*</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Assign team members to specific roles
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAssignment}
                    disabled={assignments.length >= teamMembers.length}
                    className="shadow-sm"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </div>

                <div className="space-y-3">
                  {assignments.map((assignment, index) => (
                    <div
                      key={index}
                      className="flex items-end gap-4 p-4 border-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors shadow-sm"
                    >
                      <div className="flex-1 space-y-2">
                        <Label htmlFor={`member-${index}`} className="text-sm font-semibold">
                          Team Member
                        </Label>
                        <Select
                          value={assignment.team_member_id}
                          onValueChange={(value) =>
                            updateAssignment(index, "team_member_id", value)
                          }
                        >
                          <SelectTrigger className="h-11 shadow-sm bg-background">
                            <SelectValue placeholder="Select team member" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableTeamMembers(index).map((member) => (
                              <SelectItem
                                key={member.id}
                                value={member.id.toString()}
                              >
                                <div className="flex flex-col py-1">
                                  <span className="font-medium">{member.name}</span>
                                  {member.email && (
                                    <span className="text-xs text-muted-foreground">
                                      {member.email} • {member.active_tasks || 0} active tasks
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-1 space-y-2">
                        <Label htmlFor={`role-${index}`} className="text-sm font-semibold">
                          Role
                        </Label>
                        <Select
                          value={assignment.assignment_type}
                          onValueChange={(value) =>
                            updateAssignment(index, "assignment_type", value)
                          }
                        >
                          <SelectTrigger className="h-11 shadow-sm bg-background">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="developer">💻 Developer</SelectItem>
                            <SelectItem value="tester">🧪 Tester</SelectItem>
                            <SelectItem value="reviewer">👀 Reviewer</SelectItem>
                            <SelectItem value="project_manager">📊 Project Manager</SelectItem>
                            <SelectItem value="team_lead">⭐ Team Lead</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Task Preview */}
              {newTaskData.title && (
                <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-2 border-primary/20 rounded-xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 pb-3 border-b border-primary/20">
                    <div className="bg-primary/20 rounded-lg p-2">
                      <FileDown className="h-5 w-5 text-primary" />
                    </div>
                    <h4 className="text-lg font-semibold text-primary">Task Preview</h4>
                  </div>
                  <div className="grid gap-3 text-sm">
                    <div className="flex justify-between items-start bg-background/80 rounded-lg p-3">
                      <span className="text-muted-foreground font-medium">Title:</span>
                      <span className="font-semibold text-right flex-1 ml-4">{newTaskData.title}</span>
                    </div>
                    
                    {assignments.some((a) => a.team_member_id) && (
                      <div className="bg-background/80 rounded-lg p-3">
                        <span className="text-muted-foreground font-medium block mb-2">Team Assignments:</span>
                        <div className="flex flex-wrap gap-2">
                          {assignments
                            .filter((a) => a.team_member_id)
                            .map((assignment, index) => {
                              const member = teamMembers.find(
                                (m) => m.id.toString() === assignment.team_member_id
                              );
                              return (
                                <Badge
                                  key={index}
                                  variant={getAssignmentTypeColor(
                                    assignment.assignment_type
                                  )}
                                  className="text-xs py-1 px-3 shadow-sm"
                                >
                                  {member?.name || assignment.team_member_id} • {getAssignmentTypeLabel(
                                    assignment.assignment_type
                                  )}
                                </Badge>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {newTaskData.priority && (
                        <div className="flex justify-between items-center bg-background/80 rounded-lg p-3">
                          <span className="text-muted-foreground font-medium">Complexity:</span>
                          <Badge
                            variant={getPriorityColor(newTaskData.priority) as any}
                            className="text-xs shadow-sm"
                          >
                            {newTaskData.priority}
                          </Badge>
                        </div>
                      )}
                      {newTaskData.estimated_effort_hours && (
                        <div className="flex justify-between items-center bg-background/80 rounded-lg p-3">
                          <span className="text-muted-foreground font-medium">Effort:</span>
                          <span className="font-semibold">{newTaskData.estimated_effort_hours}h</span>
                        </div>
                      )}
                    </div>

                    {(newTaskData.start_date || newTaskData.due_date) && (
                      <div className="grid grid-cols-2 gap-3">
                        {newTaskData.start_date && (
                          <div className="flex justify-between items-center bg-background/80 rounded-lg p-3">
                            <span className="text-muted-foreground font-medium">Start:</span>
                            <span className="font-semibold text-sm">
                              {new Date(newTaskData.start_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {newTaskData.due_date && (
                          <div className="flex justify-between items-center bg-background/80 rounded-lg p-3">
                            <span className="text-muted-foreground font-medium">Due:</span>
                            <span className="font-semibold text-sm">
                              {new Date(newTaskData.due_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
        </div>
        

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t bg-muted/30 flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedUnassignedTaskId(null);
              onOpenChange(false);
            }}
            className="flex-1 h-11 shadow-sm"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            className="flex-1 h-11 shadow-sm font-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2" />
                {selectedUnassignedTaskId ? "Assigning..." : "Creating..."}
              </>
            ) : (
              <>
                {selectedUnassignedTaskId ? (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Assign Team Members
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Task
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddTaskDialog;
