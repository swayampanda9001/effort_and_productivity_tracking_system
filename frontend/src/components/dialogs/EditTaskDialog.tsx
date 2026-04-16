import type React from "react";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import type { TaskStatus, TaskStage } from "@/types/common";
import { getTaskModificationRestrictionReason } from "@/utils/taskUtils";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectContent,
  SelectValue,
} from "@/components/ui/select";

interface EditTaskDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  currentStatus: TaskStatus;
  currentStage: TaskStage;
  currentEstimatedHours: number;
}

export default function EditTaskDialog({
  isOpen,
  onOpenChange,
  taskId,
  currentStatus,
  currentStage,
  currentEstimatedHours,
}: EditTaskDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Form refs for uncontrolled components
  const statusRef = useRef<string>(currentStatus);
  const stageRef = useRef<string>(currentStage);
  const estimatedHoursRef = useRef<number>(currentEstimatedHours);

  // Check if user can modify this task
  const modificationRestriction = getTaskModificationRestrictionReason(
    currentStatus,
    user?.role || ""
  );

  // Check if user is a manager (can edit estimated hours)
  const isManager = user?.role !== "team_member";

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (taskData: {
      status: TaskStatus;
      stage: TaskStage;
      estimated_effort_hours?: number;
    }) => {
      console.log(taskData);
      const response = await API.put(`/tasks/${taskId}`, taskData);
      console.log("Update Task Response:", response);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });

      // Reset form and close dialog
      statusRef.current = currentStatus;
      stageRef.current = currentStage;
      estimatedHoursRef.current = currentEstimatedHours;
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error updating task:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskId) {
      console.error("Task ID is required");
      return;
    }

    // Get values from refs
    const status = statusRef.current;
    const stage = stageRef.current;
    const estimatedHours = estimatedHoursRef.current;

    // Validate required fields
    if (!status || !stage) {
      console.error("Status and stage are required");
      return;
    }

    if (isManager && (estimatedHours <= 0 || !estimatedHours)) {
      console.error("Estimated effort hours must be greater than 0");
      return;
    }

    // Prepare task update data
    const taskData: {
      status: TaskStatus;
      stage: TaskStage;
      estimated_effort_hours?: number;
    } = {
      status: status as TaskStatus,
      stage: stage as TaskStage,
    };

    // Only include estimated_effort_hours if user is a manager
    if (isManager) {
      taskData.estimated_effort_hours = estimatedHours;
    }

    updateTaskMutation.mutate(taskData);
  };

  const handleStatusChange = (value: string) => {
    statusRef.current = value;
  };

  const handleStageChange = (value: string) => {
    stageRef.current = value;
  };

  const handleEstimatedHoursChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = parseFloat(e.target.value);
    estimatedHoursRef.current = isNaN(value) ? 0 : value;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update the status, stage
            {isManager ? ", and estimated effort hours" : ""} of this task
          </DialogDescription>
        </DialogHeader>

        {modificationRestriction ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted border border-muted-foreground/20 rounded-lg">
              <div className="text-sm text-muted-foreground">
                {modificationRestriction}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                defaultValue={currentStatus}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage">Current Stage</Label>
              <Select
                defaultValue={currentStage}
                onValueChange={handleStageChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="deployment">Deployment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isManager && (
              <div className="space-y-2">
                <Label htmlFor="estimated_hours">Estimated Effort Hours</Label>
                <Input
                  id="estimated_hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  defaultValue={currentEstimatedHours}
                  onChange={handleEstimatedHoursChange}
                  placeholder="Enter estimated hours"
                />
                <p className="text-xs text-muted-foreground">
                  Only managers can modify estimated effort hours
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={updateTaskMutation.isPending}
              >
                {updateTaskMutation.isPending ? "Updating..." : "Update Task"}
              </Button>
            </div>

            {updateTaskMutation.isError && (
              <div className="text-sm text-destructive mt-2">
                Error updating task. Please try again.
              </div>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
