import React from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  User,
  Eye,
  Wrench,
  UserCheck,
  Users2,
  Crown,
} from "lucide-react";
import type { TeamMemberAssignment } from "@/types/task";

// Shared helper functions - exported for use in other components
export const getAssignmentTypeIcon = (type: string) => {
  switch (type) {
    case "developer":
      return <User className="h-3 w-3" />;
    case "tester":
      return <UserCheck className="h-3 w-3" />;
    case "reviewer":
      return <Eye className="h-3 w-3" />;
    case "project_manager":
      return <Users2 className="h-3 w-3" />;
    case "team_lead":
      return <Crown className="h-3 w-3" />;
    default:
      return <Wrench className="h-3 w-3" />;
  }
};

export const getAssignmentTypeColor = (type: string) => {
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

export const getAssignmentTypeLabel = (type: string) => {
  switch (type) {
    case "developer":
      return "Developer";
    case "tester":
      return "Tester";
    case "reviewer":
      return "Reviewer";
    case "project_manager":
      return "Project Manager";
    case "team_lead":
      return "Team Lead";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
};

interface TaskAssignmentsDisplayProps {
  assignments: TeamMemberAssignment[];
  showCard?: boolean;
  className?: string;
}

export function TaskAssignmentsDisplay({
  assignments,
  showCard = true,
  className = "",
}: TaskAssignmentsDisplayProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!assignments || assignments.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        No assignments yet
      </div>
    );
  }

  // Deduplicate assignments - same person with same role should only appear once
  const uniqueAssignments = assignments.reduce((acc, assignment) => {
    const key = `${assignment.team_member_id}-${assignment.assignment_type}`;
    if (!acc.some((a) => `${a.team_member_id}-${a.assignment_type}` === key)) {
      acc.push(assignment);
    }
    return acc;
  }, [] as TeamMemberAssignment[]);

  const content = (
    <div className="gap-3 flex items-center flex-wrap">
      {uniqueAssignments.map((assignment, index) => (
        <div
          key={`${assignment.team_member_id}-${assignment.assignment_type}-${index}`}
          className="flex items-center gap-3 border py-2 px-3 rounded-md"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={`${import.meta.env.VITE_R2_BASE_URL}${assignment.avatar_url || "/placeholder.svg"}`} className="object-cover" />
            <AvatarFallback className="text-xs">
              {getInitials(assignment.full_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col">
            <div className="font-medium dark:text-white flex items-end gap-1">
              {assignment.full_name}
              <p className="flex items-center text-xs text-muted-foreground">
                {/* {getAssignmentTypeIcon(assignment.assignment_type)} */}                
                {getAssignmentTypeLabel(assignment.assignment_type)}
              </p>
            </div>
            <p className="">
              {assignment?.completed ? (
                <span className="text-xs text-green-500">
                  Completed
                </span>
              ) : (
                <span className="text-xs text-yellow-500">
                  Pending
                </span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  if (!showCard) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {/* <Users className="h-4 w-4" /> */}
          Assignments ({uniqueAssignments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{content}</CardContent>
    </Card>
  );
}

// Compact version for use in task cards/lists
export function CompactTaskAssignments({
  assignments,
  maxVisible = 3,
  className = "",
}: TaskAssignmentsDisplayProps & { maxVisible?: number }) {
  if (!assignments || assignments.length === 0) {
    return (
      <div className={`text-xs text-muted-foreground ${className}`}>
        <Users className="h-4 w-4 inline mr-1" />
        Unassigned
      </div>
    );
  }

  // Deduplicate assignments - same person with same role should only appear once
  const uniqueAssignments = assignments.reduce((acc, assignment) => {
    const key = `${assignment.team_member_id}-${assignment.assignment_type}`;
    if (!acc.some((a) => `${a.team_member_id}-${a.assignment_type}` === key)) {
      acc.push(assignment);
    }
    return acc;
  }, [] as TeamMemberAssignment[]);

  const visible = uniqueAssignments.slice(0, maxVisible);
  const remaining = uniqueAssignments.length - maxVisible;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {visible.map((assignment, index) => (
        <div
          key={`${assignment.team_member_id}-${assignment.assignment_type}-${index}`}
          className="flex items-center gap-1"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={assignment.avatar_url || "/placeholder.svg"} />
            <AvatarFallback className="text-xs">
              {assignment.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <Badge
            variant={getAssignmentTypeColor(assignment.assignment_type)}
            className="text-xs px-1 py-0"
          >
            {assignment.assignment_type === "developer"
              ? "D"
              : assignment.assignment_type === "tester"
              ? "T"
              : assignment.assignment_type === "reviewer"
              ? "R"
              : assignment.assignment_type === "project_manager"
              ? "PM"
              : "TL"}
          </Badge>
        </div>
      ))}

      {remaining > 0 && (
        <Badge variant="secondary" className="text-xs px-2 py-0">
          +{remaining}
        </Badge>
      )}
    </div>
  );
}
