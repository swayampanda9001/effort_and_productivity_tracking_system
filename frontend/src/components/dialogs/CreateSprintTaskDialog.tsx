import React, { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateSprintTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string | undefined;
  sprintName?: string;
  onTaskCreated?: () => void;
}

export function CreateSprintTaskDialog({
  open,
  onOpenChange,
  sprintId,
  sprintName = "Sprint",
  onTaskCreated,
}: CreateSprintTaskDialogProps) {
  const queryClient = useQueryClient();

  const getTodayDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    estimated_effort_hours: "",
    start_date: getTodayDate(),
    due_date: getTodayDate(),
    stage: "analysis",
    tags: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const response = await API.post("/tasks/", {
        sprint_id: parseInt(sprintId || "0"),
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        estimated_effort_hours: parseFloat(taskData.estimated_effort_hours),
        start_date: taskData.start_date,
        due_date: taskData.due_date,
        stage: taskData.stage,
        tags: taskData.tags
          .split(",")
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag),
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success("Task created successfully");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["backlog-tasks"] });
      onTaskCreated?.();
      handleReset();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error creating task:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create task";
      toast.error(errorMessage);
    },
  });

  const handleReset = useCallback(() => {
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      estimated_effort_hours: "",
      start_date: getTodayDate(),
      due_date: getTodayDate(),
      stage: "analysis",
      tags: "",
    });
    setIsSubmitting(false);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.title.trim()) {
        toast.error("Task title is required");
        return;
      }

      if (!formData.estimated_effort_hours) {
        toast.error("Estimated effort hours is required");
        return;
      }

      setIsSubmitting(true);
      createTaskMutation.mutate(formData);
    },
    [formData, createTaskMutation]
  );

  const getPriorityColor = useCallback((priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task for {sprintName}</DialogTitle>
          <DialogDescription>
            Create a new task and add it directly to this sprint
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Task Title */}
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                placeholder="Enter task title..."
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the task requirements..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            {/* Estimated Effort */}
            <div className="space-y-2">
              <Label htmlFor="effort">Estimated Effort (hours) *</Label>
              <Input
                id="effort"
                type="number"
                step="0.5"
                min="0.5"
                placeholder="e.g. 8"
                value={formData.estimated_effort_hours}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    estimated_effort_hours: e.target.value,
                  })
                }
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                className="bg-slate-300 text-black"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                className="bg-slate-300 text-black"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Stage */}
            <div className="space-y-2">
              <Label htmlFor="stage">Stage</Label>
              <Select
                value={formData.stage}
                onValueChange={(value) =>
                  setFormData({ ...formData, stage: value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="tags">Tags (optional)</Label>
              <Input
                id="tags"
                placeholder="frontend, api, bug (comma separated)"
                value={formData.tags}
                onChange={(e) =>
                  setFormData({ ...formData, tags: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Task Preview */}
          {formData.title && (
            <div className="p-4 bg-muted rounded-lg border">
              <h4 className="font-medium mb-3">Task Preview</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Title:</span>
                  <span className="font-medium">{formData.title}</span>
                </div>
                {formData.description && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="text-xs">{formData.description}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Priority:</span>
                  <Badge
                    variant={getPriorityColor(formData.priority) as any}
                    className="text-xs"
                  >
                    {formData.priority}
                  </Badge>
                </div>
                {formData.estimated_effort_hours && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Estimated Effort:
                    </span>
                    <span>{formData.estimated_effort_hours}h</span>
                  </div>
                )}
                {formData.start_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Date:</span>
                    <span>
                      {new Date(formData.start_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {formData.due_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due Date:</span>
                    <span>
                      {new Date(formData.due_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {formData.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.tags
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter((tag) => tag)
                      .map((tag, index) => (
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
          )}

          {/* Form Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleReset();
                onOpenChange(false);
              }}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateSprintTaskDialog;
