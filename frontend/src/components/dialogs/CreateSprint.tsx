import React, { useState, useCallback } from "react";
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
import { Plus, Rocket, Calendar, Users, Clock, Sparkles } from "lucide-react";
import API from "@/lib/axios/instance";
import { useSprintStore } from "@/lib/zustand/sprints";
import { useTeamMembersStore } from "@/lib/zustand/teamMembers";

interface CreateSprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSprintCreated?: () => void; // Optional callback for when a sprint is created
}

const CreateSprintDialog = React.memo(function CreateSprintDialog({
  open,
  onOpenChange,
  onSprintCreated,
}: CreateSprintDialogProps) {
  const { addSprint } = useSprintStore();
  const { teamMembers } = useTeamMembersStore();

  const [formData, setFormData] = useState({
    name: "",
    duration: "",
    startDate: "",
    endDate: "",
    description: "",
    status: "planning",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedTeamMembers, setSelectedTeamMembers] = useState<
    Array<{ team_member_id: number; role: string }>
  >([]);

  const calculateEndDate = (startDate: string, duration: string) => {
    if (!startDate || !duration) return "";

    const start = new Date(startDate);
    const weeks = Number.parseInt(duration.split(" ")[0]);
    const end = new Date(start);
    end.setDate(start.getDate() + weeks * 7 - 1);

    return end.toISOString().split("T")[0];
  };

  const calculateDuration = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return "";

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    if (diffTime < 0) return ""; // Invalid duration if end date is before start date
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
    const weeks = Math.ceil(diffDays / 7);

    return `${weeks} Week${weeks > 1 ? "s" : ""}`;
  };

  // Helper function that returns a number for duration display
  const calculateDurationNumber = (
    startDate: string,
    endDate: string
  ): number => {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    if (diffTime < 0) return 0; // Invalid duration if end date is before start date
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
    const weeks = Math.ceil(diffDays / 7);

    return weeks;
  };

  const handleDurationChange = useCallback((duration: string) => {
    setFormData((prev) => ({
      ...prev,
      duration: duration
        ? `${duration} Week${parseInt(duration) > 1 ? "s" : ""}`
        : "",
      endDate: calculateEndDate(
        prev.startDate,
        duration ? `${duration} Week${parseInt(duration) > 1 ? "s" : ""}` : ""
      ),
    }));
  }, []);

  const handleStartDateChange = useCallback((startDate: string) => {
    setFormData((prev) => ({
      ...prev,
      startDate,
      endDate: prev.duration
        ? calculateEndDate(startDate, prev.duration)
        : prev.endDate,
    }));
  }, []);

  const handleEndDateChange = useCallback((endDate: string) => {
    setFormData((prev) => {
      if (!prev.startDate) return prev;

      return {
        ...prev,
        endDate,
        duration: calculateDuration(prev.startDate, endDate),
      };
    });
  }, []);

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
    console.log("Toggling member:", memberId);
    setSelectedTeamMembers((prev) => {
      console.log("Previous selected members:", prev);
      const existingMember = prev.find(
        (member) => member.team_member_id === memberId
      );
      if (existingMember) {
        // Remove the member
        const newSelection = prev.filter(
          (member) => member.team_member_id !== memberId
        );
        console.log("Removing member, new selection:", newSelection);
        return newSelection;
      } else {
        // Add the member with default role
        const newSelection = [
          ...prev,
          { team_member_id: memberId, role: "developer" },
        ];
        console.log("Adding member, new selection:", newSelection);
        return newSelection;
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name || !formData.duration || !formData.startDate) {
        alert("Please fill in all required fields.");
        return;
      }
      setIsSubmitting(true);
      try {
        console.log("Creating sprint with team members:", selectedTeamMembers);
        const response = await API.post("/sprints/create", {
          name: formData.name,
          description: formData.description,
          duration: parseInt(formData.duration),
          start_date: formData.startDate,
          end_date: formData.endDate,
          status: formData.status,
          sprint_members: selectedTeamMembers,
        });
        addSprint(response.data);
        console.log("Sprint created:", response.data);

        // Call the callback if provided (for refetching data)
        if (onSprintCreated) {
          onSprintCreated();
        }

        // Reset form and close dialog
        setFormData({
          name: "",
          duration: "",
          startDate: "",
          endDate: "",
          description: "",
          status: "planning",
        });
        setSelectedTeamMembers([]);
        onOpenChange(false);
      } catch (error) {
        console.error("Error creating sprint:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, selectedTeamMembers, addSprint, onSprintCreated, onOpenChange]
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Sprint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-background to-muted/20 border-b px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold mb-1">
                Create New Sprint
              </DialogTitle>
              <DialogDescription className="text-sm">
                Define sprint details, timeline, and assign team members
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
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
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
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
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
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
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
                  value={formData.startDate}
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
                  value={formData.endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  min={formData.startDate}
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
                placeholder="e.g. 2"
                value={formData.duration && parseInt(formData.duration)}
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
          {formData.name && (
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
                    {formData.name}
                  </span>
                </div>
                {formData.startDate && formData.endDate && (
                  <>
                    <div>
                      <span className="text-muted-foreground text-xs block mb-1">
                        Duration
                      </span>
                      <span className="font-medium">
                        {formData.duration ||
                          calculateDurationNumber(
                            formData.startDate,
                            formData.endDate
                          )}{" "}
                        week(s)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block mb-1">
                        Timeline
                      </span>
                      <span className="font-medium text-xs">
                        {new Date(formData.startDate).toLocaleDateString(
                          "en-GB",
                          {
                            day: "2-digit",
                            month: "short",
                          }
                        )}{" "}
                        -{" "}
                        {new Date(formData.endDate).toLocaleDateString(
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
                      formData.status === "active" ? "default" : "secondary"
                    }
                    className="capitalize"
                  >
                    {formData.status || "planning"}
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
                  Creating Sprint...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Sprint
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default CreateSprintDialog;
