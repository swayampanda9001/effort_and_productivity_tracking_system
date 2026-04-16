import React, { useState, useCallback } from "react";
import API from "@/lib/axios/instance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Plus, FileText, Calendar, Tag, Sparkles } from "lucide-react";

interface ManualTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated?: (taskData: any) => void;
}

function ManualTaskDialog({
  open,
  onOpenChange,
  onTaskCreated,
}: ManualTaskDialogProps) {
  const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [newTaskData, setNewTaskData] = useState({
    title: "",
    description: "",
    priority: "",
    estimated_effort_hours: "",
    start_date: getTodayDate(),
    due_date: getTodayDate(),
    stage: "analysis",
    tags: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        // Create task without sprint assignment (for backlog)
        const response = await API.post("/tasks", {
          title: newTaskData.title,
          description: newTaskData.description,
          priority: newTaskData.priority.toLowerCase(),
          estimated_effort_hours: parseInt(newTaskData.estimated_effort_hours),
          start_date: newTaskData.start_date,
          due_date: newTaskData.due_date,
          stage: newTaskData.stage,
          tags: newTaskData.tags.split(",").map((tag) => tag.trim()),
          // Note: sprint_id is NOT provided, so this task goes to general backlog
        });
        console.log("New task created:", response.data);
      } catch (error) {
        console.error("Error creating task:", error);
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
        stage: "analysis",
        tags: "",
      });
      onOpenChange(false);
    },
    [newTaskData, onTaskCreated, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-background to-muted/20 border-b px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold mb-1">
                Create New Backlog Task
              </DialogTitle>
              <DialogDescription className="text-sm">
                Add a manual task to your project backlog
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Task Details Card */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">Task Details</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="taskTitle" className="text-sm font-medium">
                  Task Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="taskTitle"
                  placeholder="Enter a clear, concise task title..."
                  value={newTaskData.title}
                  onChange={(e) =>
                    setNewTaskData({
                      ...newTaskData,
                      title: e.target.value,
                    })
                  }
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="taskDescription"
                  className="text-sm font-medium"
                >
                  Description
                </Label>
                <Textarea
                  id="taskDescription"
                  placeholder="Describe requirements, acceptance criteria, and technical details..."
                  value={newTaskData.description}
                  onChange={(e) =>
                    setNewTaskData({
                      ...newTaskData,
                      description: e.target.value,
                    })
                  }
                  rows={4}
                  className="transition-all focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority" className="text-sm font-medium">
                    Complexity <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={newTaskData.priority}
                    onValueChange={(value) =>
                      setNewTaskData({ ...newTaskData, priority: value })
                    }
                  >
                    <SelectTrigger className="transition-all hover:border-primary/50">
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
                  <Label
                    htmlFor="estimatedEffort"
                    className="text-sm font-medium"
                  >
                    Estimated Hours <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="estimatedEffort"
                    type="number"
                    step="0.5"
                    min="0.5"
                    placeholder="e.g. 8"
                    value={newTaskData.estimated_effort_hours}
                    onChange={(e) =>
                      setNewTaskData({
                        ...newTaskData,
                        estimated_effort_hours: e.target.value,
                      })
                    }
                    className="transition-all focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialStage" className="text-sm font-medium">
                  Initial Stage
                </Label>
                <Select
                  value={newTaskData.stage}
                  onValueChange={(value) =>
                    setNewTaskData({ ...newTaskData, stage: value })
                  }
                >
                  <SelectTrigger className="transition-all hover:border-primary/50">
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
            </div>
          </div>

          {/* Timeline & Metadata Card */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">Timeline & Metadata</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-sm font-medium">
                  Start Date
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={newTaskData.start_date}
                  onChange={(e) =>
                    setNewTaskData({
                      ...newTaskData,
                      start_date: e.target.value,
                    })
                  }
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate" className="text-sm font-medium">
                  Due Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={newTaskData.due_date}
                  onChange={(e) =>
                    setNewTaskData({
                      ...newTaskData,
                      due_date: e.target.value,
                    })
                  }
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <Label htmlFor="tags" className="text-sm font-medium">
                  Tags
                </Label>
              </div>
              <Input
                id="tags"
                placeholder="frontend, api, authentication (comma separated)"
                value={newTaskData.tags}
                onChange={(e) =>
                  setNewTaskData({
                    ...newTaskData,
                    tags: e.target.value,
                  })
                }
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Task Preview */}
          {newTaskData.title && (
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-5 border border-primary/20 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-primary/20 rounded-md">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="font-semibold text-sm">Task Preview</h4>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs block mb-1">
                    Title
                  </span>
                  <span className="font-medium text-foreground">
                    {newTaskData.title}
                  </span>
                </div>
                {newTaskData.priority && (
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">
                      Complexity
                    </span>
                    <span className="capitalize font-medium">
                      {newTaskData.priority}
                    </span>
                  </div>
                )}
                {newTaskData.estimated_effort_hours && (
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">
                      Estimated Effort
                    </span>
                    <span className="font-medium">
                      {newTaskData.estimated_effort_hours}h
                    </span>
                  </div>
                )}
                {newTaskData.start_date && (
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">
                      Start Date
                    </span>
                    <span className="font-medium">
                      {new Date(newTaskData.start_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {newTaskData.due_date && (
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">
                      Due Date
                    </span>
                    <span className="font-medium">
                      {new Date(newTaskData.due_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="border-t bg-muted/30 px-6 py-4">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 transition-all hover:bg-background"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 transition-all shadow-sm hover:shadow"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ManualTaskDialog;
