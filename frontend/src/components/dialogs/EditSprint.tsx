import React, { useState, useCallback } from "react";
import API from "@/lib/axios/instance";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Edit, Rocket, Calendar, Users, Clock, Sparkles } from "lucide-react";
import { useTeamMembersStore } from "@/lib/zustand/teamMembers";

interface EditSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintData?: {
    id: number;
    name: string;
    description?: string;
    startDate: string;
    endDate: string;
    status: string;
    sprint_members?: Array<{ team_member_id: number; role: string }>;
  };
  onSprintUpdated?: () => void;
}

function EditSprintDialog({
  open,
  onOpenChange,
  sprintData,
  onSprintUpdated,
}: EditSprintDialogProps) {
  const { teamMembers } = useTeamMembersStore();
  // Helper function to calculate duration in weeks

  const calculateDuration = useCallback(
    (startDate: string, endDate: string) => {
      if (!startDate || !endDate) return "";
      const start = new Date(startDate);
      const end = new Date(endDate);
      const timeDiff = end.getTime() - start.getTime();
      if (timeDiff < 0) return "";
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      return Math.ceil(daysDiff / 7);
    },
    []
  );

  // Helper function to calculate end date from duration
  const calculateEndDate = useCallback((startDate: string, weeks: number) => {
    const start = new Date(startDate);
    const endDate = new Date(start);
    endDate.setDate(start.getDate() + weeks * 7);
    return endDate.toISOString().split("T")[0];
  }, []);

  // Internal state for edit sprint data
  const [editSprintData, setEditSprintData] = useState({
    name: sprintData?.name || "",
    description: sprintData?.description || "",
    startDate: sprintData?.startDate || "",
    endDate: sprintData?.endDate || "",
    duration: sprintData
      ? calculateDuration(sprintData.startDate, sprintData.endDate).toString()
      : "",
    status: sprintData?.status || "planning",
  });

  const [selectedTeamMembers, setSelectedTeamMembers] = useState<
    Array<{ team_member_id: number; role: string }>
  >(() => {
    // Initialize with sprint_members from props if available
    if (sprintData?.sprint_members) {
      return sprintData.sprint_members.map((member) => ({
        team_member_id: member.team_member_id,
        role: member.role || "developer",
      }));
    }
    return [];
  });

  // Load existing sprint members
  React.useEffect(() => {
    if (sprintData?.id && !sprintData?.sprint_members) {
      // Only fetch if sprint_members are not already provided in props
      const loadSprintMembers = async () => {
        try {
          const response = await API.get(`/sprints/${sprintData.id}`);
          console.log("Sprint data loaded:", response.data);
          if (response.data.sprint_members) {
            const existingMembers = response.data.sprint_members.map(
              (member: any) => ({
                team_member_id: member.team_member_id,
                role: member.role || "developer",
              })
            );
            console.log("Setting existing members:", existingMembers);
            setSelectedTeamMembers(existingMembers);
          } else {
            // No existing members, clear selection
            setSelectedTeamMembers([]);
          }
        } catch (error) {
          console.error("Error loading sprint members:", error);
          setSelectedTeamMembers([]);
        }
      };
      loadSprintMembers();
    }
  }, [sprintData?.id, sprintData?.sprint_members]);

  // Update internal state when sprintData changes
  React.useEffect(() => {
    if (sprintData) {
      setEditSprintData({
        name: sprintData.name,
        description: sprintData.description || "",
        startDate: sprintData.startDate,
        endDate: sprintData.endDate,
        duration: calculateDuration(
          sprintData.startDate,
          sprintData.endDate
        ).toString(),
        status: sprintData.status,
      });
    }
  }, [sprintData, calculateDuration]);

  // Mutation for updating sprint
  const updateSprintMutation = useMutation({
    mutationFn: async (updateData: {
      name: string;
      description: string;
      start_date: string;
      end_date: string;
      duration: number;
      status: string;
      sprint_members: Array<{ team_member_id: number; role: string }>;
    }) => {
      if (!sprintData?.id) {
        throw new Error("Sprint ID is missing");
      }
      return await API.put(`/sprints/${sprintData.id}`, updateData);
    },
    onSuccess: (response) => {
      console.log("Sprint updated successfully:", response.data);
      toast.success("Sprint updated successfully!");
      onOpenChange(false);
      onSprintUpdated?.(); // Call the parent callback
    },
    onError: (error: any) => {
      console.error("Error updating sprint:", error);
      if (error?.response?.status === 400) {
        toast.error("Invalid sprint data. Please check your inputs.");
      } else if (error?.response?.status === 403) {
        toast.error("You don't have permission to update this sprint.");
      } else if (error?.response?.status === 404) {
        toast.error("Sprint not found.");
      } else if (error?.response?.data?.detail) {
        toast.error(`Error: ${error.response.data.detail}`);
      } else {
        toast.error("Failed to update sprint. Please try again.");
      }
    },
  });

  // Event handlers
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      console.log("Sprint updated:", editSprintData);
      console.log("Updated team members:", selectedTeamMembers);

      // Prepare the update data
      const updateData = {
        name: editSprintData.name,
        description: editSprintData.description,
        start_date: editSprintData.startDate,
        end_date: editSprintData.endDate,
        duration: parseInt(editSprintData.duration),
        status: editSprintData.status,
        sprint_members: selectedTeamMembers,
      };

      // Trigger the mutation
      updateSprintMutation.mutate(updateData);
    },
    [editSprintData, selectedTeamMembers, updateSprintMutation]
  );

  const handleStartDateChange = useCallback(
    (value: string) => {
      setEditSprintData((prev) => {
        const newData = { ...prev, startDate: value };
        if (prev.duration) {
          // If duration is set, calculate new end date
          newData.endDate = calculateEndDate(value, parseInt(prev.duration));
        }
        return newData;
      });
    },
    [calculateEndDate]
  );

  const handleEndDateChange = useCallback(
    (value: string) => {
      setEditSprintData((prev) => {
        const newData = { ...prev, endDate: value };
        // Calculate duration based on new end date
        const weeks = calculateDuration(prev.startDate, value);
        newData.duration = weeks.toString();
        return newData;
      });
    },
    [calculateDuration]
  );

  const handleDurationChange = useCallback(
    (value: string) => {
      setEditSprintData((prev) => {
        const newData = { ...prev, duration: value };
        if (value && !isNaN(parseInt(value))) {
          // Calculate new end date based on duration
          newData.endDate = calculateEndDate(prev.startDate, parseInt(value));
        }
        return newData;
      });
    },
    [calculateEndDate]
  );

  // Team member selection handlers
  const handleSelectAllTeamMembers = useCallback(() => {
    if (selectedTeamMembers.length === teamMembers.length) {
      // If all are selected, deselect all
      setSelectedTeamMembers([]);
    } else {
      // Select all team members with default role
      setSelectedTeamMembers(
        teamMembers.map((member) => ({
          team_member_id: member.id,
          role: "developer",
        }))
      );
    }
  }, [selectedTeamMembers.length, teamMembers]);

  const handleTeamMemberToggle = useCallback((memberId: number) => {
    setSelectedTeamMembers((prev) => {
      const existingMember = prev.find(
        (member) => member.team_member_id === memberId
      );
      if (existingMember) {
        // Remove the member
        return prev.filter((member) => member.team_member_id !== memberId);
      } else {
        // Add the member with default role
        return [...prev, { team_member_id: memberId, role: "developer" }];
      }
    });
  }, []);

  const handleRoleChange = useCallback((memberId: number, newRole: string) => {
    setSelectedTeamMembers((prev) =>
      prev.map((member) =>
        member.team_member_id === memberId
          ? { ...member, role: newRole }
          : member
      )
    );
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          Edit Sprint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-background to-muted/20 border-b px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Edit className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold mb-1">
                Edit Sprint
              </DialogTitle>
              <DialogDescription className="text-sm">
                Update sprint details, timeline, and team member assignments
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Sprint Details Card */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">Sprint Details</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sprintName" className="text-sm font-medium">
                  Sprint Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sprintName"
                  placeholder="e.g., Sprint 1 - User Authentication"
                  value={editSprintData.name}
                  onChange={(e) =>
                    setEditSprintData({
                      ...editSprintData,
                      name: e.target.value,
                    })
                  }
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="sprintDescription"
                  className="text-sm font-medium"
                >
                  Description
                </Label>
                <Textarea
                  id="sprintDescription"
                  placeholder="Describe the sprint goals, objectives, and deliverables..."
                  value={editSprintData.description}
                  onChange={(e) =>
                    setEditSprintData({
                      ...editSprintData,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  className="transition-all focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-medium">
                  Status
                </Label>
                <Select
                  value={editSprintData.status}
                  onValueChange={(value) =>
                    setEditSprintData({ ...editSprintData, status: value })
                  }
                >
                  <SelectTrigger className="transition-all hover:border-primary/50">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">📋 Planning</SelectItem>
                    <SelectItem value="active">🚀 Active</SelectItem>
                    <SelectItem value="completed">✅ Completed</SelectItem>
                    <SelectItem value="on_hold">⏸️ On Hold</SelectItem>
                    <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Timeline Card */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">Timeline</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-sm font-medium">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={editSprintData.startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-sm font-medium">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={editSprintData.endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  min={editSprintData.startDate}
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <Label htmlFor="duration" className="text-sm font-medium">
                  Duration (weeks)
                </Label>
              </div>
              <Input
                id="duration"
                type="number"
                min="1"
                max="12"
                placeholder="2"
                value={editSprintData.duration}
                onChange={(e) => handleDurationChange(e.target.value)}
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                💡 Changing duration will update the end date automatically
              </p>
            </div>
          </div>

          {/* Team Members Card */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-base">Team Members</h3>
                {selectedTeamMembers.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedTeamMembers.length} selected
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAllTeamMembers}
                className="transition-all hover:bg-primary/5"
              >
                {selectedTeamMembers.length === teamMembers.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {teamMembers.map((member) => {
                const selectedMember = selectedTeamMembers.find(
                  (sm) => sm.team_member_id === member.id
                );
                const isSelected = !!selectedMember;

                return (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                      isSelected
                        ? "bg-primary/10 border-primary/30 shadow-sm"
                        : "hover:bg-muted/50 hover:border-primary/20 border-border"
                    }`}
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleTeamMemberToggle(member.id)}
                        className="rounded h-4 w-4 transition-all cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {member.full_name || member.email}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {member.position || "Team Member"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Select
                        value={selectedMember.role}
                        onValueChange={(role) =>
                          handleRoleChange(member.id, role)
                        }
                      >
                        <SelectTrigger className="w-36 transition-all hover:border-primary/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="developer">
                            💻 Developer
                          </SelectItem>
                          <SelectItem value="tester">🧪 Tester</SelectItem>
                          <SelectItem value="designer">🎨 Designer</SelectItem>
                          <SelectItem value="analyst">📊 Analyst</SelectItem>
                          <SelectItem value="lead">⭐ Lead</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sprint Preview */}
          {editSprintData.name && (
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-5 border border-primary/20 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-primary/20 rounded-md">
                  <Rocket className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="font-semibold text-sm">Sprint Preview</h4>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs block mb-1">
                    Sprint Name
                  </span>
                  <span className="font-medium text-foreground">
                    {editSprintData.name}
                  </span>
                </div>
                {editSprintData.startDate && editSprintData.endDate && (
                  <>
                    <div>
                      <span className="text-muted-foreground text-xs block mb-1">
                        Duration
                      </span>
                      <span className="font-medium">
                        {editSprintData.duration ||
                          calculateDuration(
                            editSprintData.startDate,
                            editSprintData.endDate
                          )}{" "}
                        week(s)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block mb-1">
                        Timeline
                      </span>
                      <span className="font-medium text-xs">
                        {new Date(editSprintData.startDate).toLocaleDateString(
                          "en-GB",
                          {
                            day: "2-digit",
                            month: "short",
                          }
                        )}{" "}
                        -{" "}
                        {new Date(editSprintData.endDate).toLocaleDateString(
                          "en-GB",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </span>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-muted-foreground text-xs block mb-1">
                    Status
                  </span>
                  <Badge
                    variant={
                      editSprintData.status === "active"
                        ? "default"
                        : "secondary"
                    }
                    className="capitalize"
                  >
                    {editSprintData.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block mb-1">
                    Team Size
                  </span>
                  <span className="font-medium">
                    {selectedTeamMembers.length > 0
                      ? `${selectedTeamMembers.length} member${
                          selectedTeamMembers.length !== 1 ? "s" : ""
                        }`
                      : "No members"}
                  </span>
                </div>
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
              disabled={updateSprintMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 transition-all shadow-sm hover:shadow"
              disabled={updateSprintMutation.isPending}
            >
              {updateSprintMutation.isPending ? (
                <>
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Updating Sprint...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Update Sprint
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditSprintDialog;
