import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Users, Loader2, X, UserMinus } from "lucide-react";
import {
  getAssignmentTypeColor,
  getAssignmentTypeLabel,
  getAssignmentTypeIcon,
} from "@/components/TaskAssignmentsDisplay";
import type { TeamMemberAssignment, AssignmentInput } from "@/types/task";

interface SprintMember {
  id: number;
  full_name: string;
  avatar_url?: string;
  role: string;
  active_tasks?: number;
  completed_tasks?: number;
}

interface AssignMultipleUsersDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  sprintId?: number;
  currentAssignments?: TeamMemberAssignment[];
  onSuccess?: () => void;
}

export function AssignMultipleUsersDialog({
  isOpen,
  onOpenChange,
  taskId,
  taskTitle,
  sprintId,
  currentAssignments = [],
  onSuccess,
}: AssignMultipleUsersDialogProps) {
  const [assignments, setAssignments] = useState<AssignmentInput[]>([
    { team_member_id: "", team_member_name: "", assignment_type: "developer" },
  ]);
  const [newAssignment, setNewAssignment] = useState<AssignmentInput>({
    team_member_id: "",
    team_member_name: "",
    assignment_type: "developer",
  });
  const queryClient = useQueryClient();

  // Initialize assignments from current assignments
  useEffect(() => {
    console.log("Current assignments:", currentAssignments);
    if (currentAssignments && currentAssignments.length > 0) {
      setAssignments(
        currentAssignments
          .filter((a) => a && a.team_member_id != null && a.assignment_type)
          .map((a) => ({
            team_member_id: a.team_member_id.toString(),
            team_member_name: a.full_name,
            assignment_type: a.assignment_type,
          }))
      );
    }
  }, [currentAssignments]);

  // Fetch sprint members instead of all team members
  const {
    data: sprintMembers = [],
    isLoading: isLoadingMembers,
    error: sprintMembersError,
  } = useQuery({
    queryKey: ["sprint-members", sprintId],
    queryFn: async () => {
      try {
        if (!sprintId) {
          // Fallback: get task details to find sprint ID
          const taskResponse = await API.get(`/tasks/${taskId}`);
          const taskSprintId = taskResponse.data.sprint_id;
          if (!taskSprintId) {
            throw new Error("Sprint ID not found for this task");
          }
          const response = await API.get(
            `/sprints/${taskSprintId}/sprint-members`
          );
          console.log("Sprint members from fallback:", response.data);
          return response.data || [];
        }
        const response = await API.get(`/sprints/${sprintId}/sprint-members`);
        console.log("Sprint members:", response.data);
        return response.data || [];
      } catch (error) {
        console.error("Error fetching sprint members:", error);
        toast.error("Failed to load sprint members");
        return [];
      }
    },
    enabled: isOpen && (!!sprintId || !!taskId),
  });

  // Assign multiple users mutation
  const assignMultipleUsersMutation = useMutation({
    mutationFn: async (assignmentsData: AssignmentInput[]) => {
      if (assignmentsData.length === 0) {
        throw new Error("At least one assignment is required");
      }

      // Filter out empty assignments
      const validAssignments = assignmentsData.filter(
        (a) => a.team_member_id && a.assignment_type
      );

      console.log("Valid assignments to submit:", validAssignments);

      if (validAssignments.length === 0) {
        throw new Error("Please select at least one team member");
      }

      const response = await API.post(
        `/tasks/${taskId}/assign-multiple`,
        validAssignments
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success("Task assigned to multiple users successfully");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onSuccess?.();
      onOpenChange(false);
      // Reset to initial state
      setAssignments([
        {
          team_member_id: "",
          team_member_name: "",
          assignment_type: "developer",
        },
      ]);
    },
    onError: (error: any) => {
      console.error("Error assigning task to multiple users:", error);
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to assign task to multiple users";
      toast.error(errorMessage);
    },
  });

  const addAssignment = () => {
    setAssignments([
      ...assignments,
      { team_member_id: "", team_member_name: "", assignment_type: "tester" },
    ]);
  };

  const removeAssignment = (index: number) => {
    if (assignments.length > 1) {
      setAssignments(assignments.filter((_, i) => i !== index));
    }
  };

  // Prefer removing by team_member_id when available
  const removeAssignmentByMemberId = (memberId: string) => {
    if (!memberId) return;
    if (assignments.length > 1) {
      const idx = assignments.findIndex((a) => a.team_member_id === memberId);
      if (idx === -1) return;
      const updated = [...assignments];
      updated.splice(idx, 1);
      setAssignments(updated);
    }
  };

  const updateAssignment = (
    index: number,
    field: keyof AssignmentInput,
    value: string
  ) => {
    const updated = [...assignments];
    updated[index][field] = value as any;
    setAssignments(updated);
  };

  // Prefer updating by team_member_id when possible (after selection)
  const updateAssignmentByMemberId = (
    memberId: string,
    field: keyof AssignmentInput,
    value: string
  ) => {
    if (!memberId) return;
    const idx = assignments.findIndex((a) => a.team_member_id === memberId);
    if (idx === -1) return;
    const updated = [...assignments];
    updated[idx][field] = value as any;
    setAssignments(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMultipleUsersMutation.mutate(assignments);
  };

  const handleCancel = () => {
    setAssignments([
      {
        team_member_id: "",
        team_member_name: "",
        assignment_type: "developer",
      },
    ]);
    onOpenChange(false);
  };

  const getAssignmentTypeColor = (type: string) => {
    switch (type) {
      case "developer":
        return "default";
      case "tester":
        return "secondary";
      case "reviewer":
        return "outline";
      case "project_manager":
        return "destructive";
      case "team_lead":
        return "secondary";
      default:
        return "default";
    }
  };

  const getAvailableSprintMembers = (currentIndex: number) => {
    if (!Array.isArray(sprintMembers)) return [];

    const selectedMemberIds = assignments
      .filter((_, index) => index !== currentIndex)
      .map((a) => a.team_member_id)
      .filter(Boolean);

    return sprintMembers.filter(
      (member: SprintMember) =>
        member && member.id && !selectedMemberIds.includes(member.id.toString())
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Assign Multiple Users
          </DialogTitle>
          <DialogDescription>
            Assign "{taskTitle}" to multiple team members with different roles
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            {assignments.map((assignment, index) => (
              <div
                key={assignment.team_member_id || index}
                className="flex items-end gap-4 p-4 border rounded-lg bg-muted/50"
              >
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`member-${index}`}>Team Member</Label>
                  {isLoadingMembers ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-muted-foreground">
                        Loading sprint members...
                      </span>
                    </div>
                  ) : sprintMembersError ? (
                    <div className="text-center py-2 text-destructive">
                      <span className="text-sm">
                        Failed to load sprint members
                      </span>
                    </div>
                  ) : sprintMembers.length === 0 ? (
                    <div className="text-center py-2 text-muted-foreground">
                      <span className="text-sm">No sprint members found</span>
                    </div>
                  ) : (
                    <Select
                      value={assignment.team_member_id}
                      onValueChange={(value) => {
                        const selectedMember = sprintMembers.find(
                          (member: SprintMember) =>
                            member.id?.toString() === value
                        );
                        // Use index-based update for initial selection (there may be no memberId yet)
                        updateAssignment(index, "team_member_id", value);
                        updateAssignment(
                          index,
                          "team_member_name",
                          selectedMember?.full_name || ""
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member">
                          {assignment.team_member_id &&
                            (() => {
                              const selectedMember = sprintMembers.find(
                                (member: SprintMember) =>
                                  member.id?.toString() ===
                                  assignment.team_member_id
                              );
                              return selectedMember ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage
                                      src={
                                        selectedMember.avatar_url ||
                                        "/placeholder.svg"
                                      }
                                    />
                                    <AvatarFallback className="text-xs">
                                      {(selectedMember.full_name || "")
                                        .split(" ")
                                        .map((n: string) => n[0])
                                        .join("")
                                        .toUpperCase()
                                        .slice(0, 2) || "??"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col text-left">
                                    <span className="font-medium">
                                      {selectedMember.full_name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {selectedMember.role} •{" "}
                                      {selectedMember.active_tasks || 0} active
                                      tasks
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                assignment.team_member_name ||
                                  "Select team member"
                              );
                            })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableSprintMembers(index).map(
                          (member: SprintMember) => {
                            if (!member || !member.id || !member.full_name) {
                              console.warn("Invalid member data:", member);
                              return null;
                            }
                            return (
                              <SelectItem
                                key={member.id}
                                value={member.id.toString()}
                              >
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage
                                      src={
                                        member.avatar_url || "/placeholder.svg"
                                      }
                                    />
                                    <AvatarFallback className="text-xs">
                                      {(member.full_name || "")
                                        .split(" ")
                                        .map((n: string) => n[0])
                                        .join("")
                                        .toUpperCase()
                                        .slice(0, 2) || "??"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {member.full_name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {member.role} • {member.active_tasks || 0}{" "}
                                      active tasks
                                    </span>
                                  </div>
                                </div>
                              </SelectItem>
                            );
                          }
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <Label htmlFor={`role-${index}`}>Role</Label>
                  <Select
                    value={assignment.assignment_type}
                    onValueChange={(value) =>
                      // Prefer updating by member id if assigned, otherwise fall back to index
                      assignment.team_member_id
                        ? updateAssignmentByMemberId(
                            assignment.team_member_id,
                            "assignment_type",
                            value
                          )
                        : updateAssignment(index, "assignment_type", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="developer">Developer</SelectItem>
                      <SelectItem value="tester">Tester</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                      <SelectItem value="project_manager">
                        Project Manager
                      </SelectItem>
                      <SelectItem value="team_lead">Team Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  {assignment.assignment_type && (
                    <Badge
                      variant={getAssignmentTypeColor(
                        assignment.assignment_type
                      )}
                    >
                      {assignment.assignment_type}
                    </Badge>
                  )}
                  {assignments.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        assignment.team_member_id
                          ? removeAssignmentByMemberId(
                              assignment.team_member_id
                            )
                          : removeAssignment(index)
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={addAssignment}
              disabled={assignments.length >= sprintMembers.length}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Another Assignment
            </Button>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={assignMultipleUsersMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                assignMultipleUsersMutation.isPending ||
                assignments.some((a) => !a.team_member_id || !a.assignment_type)
              }
            >
              {assignMultipleUsersMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Assigning...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Assign to {
                    assignments.filter((a) => a.team_member_id).length
                  }{" "}
                  Users
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
