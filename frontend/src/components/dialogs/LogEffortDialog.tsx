import type React from "react";
import { useRef, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import API from "@/lib/axios/instance";
import type { CreateEffortLogData } from "@/types/effort-log";
import type { TaskStage, TaskStatus } from "@/types/common";
import { getEffortLoggingRestrictionReason } from "@/utils/taskUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectContent,
  SelectValue,
} from "@/components/ui/select";
import { getTodaysDate } from "@/utils/Formatter";

interface LogEffortDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  task: {
    stage: TaskStage;
    status: TaskStatus;
    created_at?: string;
    due_date?: string; // Optional, kept for future use
  };
  sprint: {
    created_at: string;
    start_date?: string;
    end_date?: string;
  };
  onSuccess?: () => void;
}

export default function LogEffortDialog({
  isOpen,
  onOpenChange,
  taskId,
  task,
  sprint,
  onSuccess,
}: LogEffortDialogProps) {
  const queryClient = useQueryClient();

  // Form refs for uncontrolled components
  const timeSpentRef = useRef<HTMLInputElement>(null);
  const dailyUpdateRef = useRef<HTMLTextAreaElement>(null);
  const blockersRef = useRef<HTMLTextAreaElement>(null);
  const nextDayPlanRef = useRef<HTMLTextAreaElement>(null);

  // Date selection state
  const [selectedDate, setSelectedDate] = useState<string>(getTodaysDate());

  // Calculate date range based on sprint creation date
  const getDateRange = () => {
    const today = new Date();
    const todayStr = getTodaysDate();

    // Minimum date is sprint creation date (or sprint start date if available)
    let minDate = sprint.start_date
      ? sprint.start_date.split("T")[0]
      : sprint.created_at.split("T")[0];

    // Maximum date is always today (users can't log effort for future dates)
    const maxDate = todayStr;

    // Ensure minDate is not in the future (shouldn't happen, but just in case)
    if (new Date(minDate) > today) {
      minDate = todayStr;
    }

    return { minDate, maxDate };
  };

  const { minDate, maxDate } = getDateRange();

  // Helper function to format date for display
  const formatDateForDisplay = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(getTodaysDate());
    }
  }, [isOpen]);

  // Check if effort logging is allowed for this task
  const effortLoggingRestriction = getEffortLoggingRestrictionReason(
    task.status
  );

  // Create effort log mutation
  const createEffortLogMutation = useMutation({
    mutationFn: async (effortLogData: CreateEffortLogData) => {
      const response = await API.post("/effort-logs/", effortLogData);
      if (response.status === 200 || response.status === 201) {
        return response.data;
      }
      throw new Error("Failed to create effort log");
    },
    onSuccess: () => {
      // Refresh the cache for related queries
      queryClient.invalidateQueries({
        queryKey: ["effort-logs", taskId],
        refetchType: "active",
      });
      queryClient.invalidateQueries({
        queryKey: ["task", taskId],
        refetchType: "active",
      });

      // Reset form
      if (timeSpentRef.current) timeSpentRef.current.value = "";
      if (dailyUpdateRef.current) dailyUpdateRef.current.value = "";
      if (blockersRef.current) blockersRef.current.value = "";
      if (nextDayPlanRef.current) nextDayPlanRef.current.value = "";
      setSelectedDate(getTodaysDate()); // Reset date to today

      // Close the dialog
      onOpenChange(false);

      toast.success("Effort logged successfully");

      // Call onSuccess callback if provided
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error("Error creating effort log:", error);
      const errorMessage =
        error.response?.data?.detail || "Failed to log effort";
      toast.error(errorMessage);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskId) {
      console.error("Task ID is required");
      return;
    }

    // Get values from refs
    const timeSpent = timeSpentRef.current?.value;
    const dailyUpdate = dailyUpdateRef.current?.value;
    const blockers = blockersRef.current?.value;
    const nextDayPlan = nextDayPlanRef.current?.value;

    // Validate required fields
    if (!timeSpent || !dailyUpdate || !nextDayPlan) {
      toast.error("All required fields must be filled");
      return;
    }

    // Validate selected date is within allowed range
    const selectedDateObj = new Date(selectedDate);
    const minDateObj = new Date(minDate);
    const maxDateObj = new Date(maxDate);

    if (selectedDateObj < minDateObj) {
      toast.error(
        `Cannot log effort before sprint start date (${formatDateForDisplay(
          minDate
        )})`
      );
      return;
    }

    if (selectedDateObj > maxDateObj) {
      toast.error(
        `Cannot log effort for future dates. Please select today or earlier.`
      );
      return;
    }

    // Prepare effort log data
    const effortLogData: CreateEffortLogData = {
      task_id: parseInt(taskId),
      log_date: selectedDate, // YYYY-MM-DD format
      time_spent_hours: parseFloat(timeSpent),
      stage: task.stage,
      daily_update: dailyUpdate,
      blockers: blockers || undefined,
      next_day_plan: nextDayPlan,
    };

    createEffortLogMutation.mutate(effortLogData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Daily Effort</DialogTitle>
          <DialogDescription>
            Record your daily effort and progress updates
          </DialogDescription>
        </DialogHeader>

        {effortLoggingRestriction ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted border border-muted-foreground/20 rounded-lg">
              <div className="text-sm text-muted-foreground">
                {effortLoggingRestriction}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="logDate">Log Date</Label>
                <Input
                  id="logDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-300 text-black"
                  min={minDate}
                  max={maxDate}
                  required
                />
                <div className="text-xs text-muted-foreground">
                  Select any date from sprint start (
                  {formatDateForDisplay(minDate)}) up to today
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeSpent">Time Spent (hours)</Label>
                <Input
                  id="timeSpent"
                  ref={timeSpentRef}
                  type="number"
                  step="0.5"
                  placeholder="6.5"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dailyUpdate">Daily Update</Label>
              <Textarea
                id="dailyUpdate"
                ref={dailyUpdateRef}
                placeholder="Summarize your progress and current status..."
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="blockers">Blockers (if any)</Label>
                <Textarea
                  id="blockers"
                  ref={blockersRef}
                  placeholder="Any issues or blockers..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextDayPlan">Next Day Plan</Label>
                <Textarea
                  id="nextDayPlan"
                  ref={nextDayPlanRef}
                  placeholder="What you plan to work on next..."
                  required
                />
              </div>
            </div>

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
                disabled={createEffortLogMutation.isPending}
              >
                {createEffortLogMutation.isPending
                  ? "Submitting..."
                  : "Submit Effort Log"}
              </Button>
            </div>

            {createEffortLogMutation.isError && (
              <div className="text-sm text-destructive mt-2">
                Error creating effort log. Please try again.
              </div>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
