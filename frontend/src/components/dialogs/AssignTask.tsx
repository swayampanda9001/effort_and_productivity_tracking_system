import React, { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  id: number;
  full_name: string;
  email: string;
  active_tasks?: number;
  completed_tasks?: number;
}

interface AssignTaskDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  currentAssignee?: string;
  onSuccess?: () => void;
}

export function AssignTaskDialog({
  isOpen,
  onOpenChange,
  taskId,
  taskTitle,
  currentAssignee,
  onSuccess,
}: AssignTaskDialogProps) {
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>("");
  const queryClient = useQueryClient();

  // Fetch team members
  const { data: teamMembers = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const response = await API.get("/team-members/");
      return response.data;
    },
    enabled: isOpen,
  });

  // Assign task mutation
  const assignTaskMutation = useMutation({
    mutationFn: async (teamMemberId: string) => {
      if (!teamMemberId) {
        throw new Error("Please select a team member");
      }

      if (teamMemberId === "unassign") {
        // Unassign the task
        const response = await API.post(`/tasks/${taskId}/unassign`);
        return response.data;
      } else {
        // Assign to team member
        const response = await API.post(
          `/tasks/${taskId}/assign?team_member_id=${teamMemberId}&assignment_type=developer`
        );
        return response.data;
      }
    },
    onSuccess: (_, variables) => {
      const message =
        variables === "unassign"
          ? "Task unassigned successfully"
          : "Task assigned successfully";
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onSuccess?.();
      onOpenChange(false);
      setSelectedTeamMember("");
    },
    onError: (error) => {
      console.error("Error assigning/unassigning task:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to assign/unassign task";
      toast.error(errorMessage);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedTeamMember) {
        toast.error("Please select a team member");
        return;
      }
      assignTaskMutation.mutate(selectedTeamMember);
    },
    [selectedTeamMember, assignTaskMutation]
  );

  const handleCancel = useCallback(() => {
    setSelectedTeamMember("");
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {currentAssignee ? "Reassign Task" : "Assign Task"}
          </DialogTitle>
          <DialogDescription>
            {currentAssignee
              ? `Reassign "${taskTitle}" to a different team member`
              : `Assign "${taskTitle}" to a team member`}
            {currentAssignee && (
              <span className="block mt-1 text-sm font-medium">
                Currently assigned to: {currentAssignee}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-member">Select Team Member</Label>
            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading team members...
                </span>
              </div>
            ) : (
              <Select
                value={selectedTeamMember}
                onValueChange={setSelectedTeamMember}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team member" />
                </SelectTrigger>
                <SelectContent>
                  {currentAssignee && (
                    <SelectItem value="unassign" className="text-red-600">
                      <div className="flex flex-col">
                        <span className="font-medium">Unassign Task</span>
                        <span className="text-xs text-muted-foreground">
                          Remove current assignment
                        </span>
                      </div>
                    </SelectItem>
                  )}
                  {teamMembers.map((member: TeamMember) => (
                    <SelectItem
                      key={member.id}
                      value={member.id.toString()}
                      className="flex flex-col items-start"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{member.full_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {member.email} • {member.active_tasks} active tasks
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={assignTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={assignTaskMutation.isPending || !selectedTeamMember}
            >
              {assignTaskMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {selectedTeamMember === "unassign"
                    ? "Unassigning..."
                    : "Assigning..."}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {selectedTeamMember === "unassign"
                    ? "Unassign Task"
                    : "Assign Task"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
