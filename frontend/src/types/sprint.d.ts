import type { BaseEntity, SprintStatus, TaskWithDetails } from "./common";

export interface Sprint extends BaseEntity {
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  duration: number; // Duration in weeks
  status: SprintStatus;
  created_by: number;
}

export interface SprintWithStats extends Sprint {
  total_tasks?: number;
  completed_tasks?: number;
  sprint_members?: SprintMember[];
  estimated_effort?: number;
  planned_effort_hours?: number;
  logged_effort_hours?: number;
  actual_effort?: number;
  progress?: number;
  velocity?: number;
  days_remaining?: number;
  total_days?: number;
}

export interface CreateSprintData {
  name: string;
  description?: string;
  duration: string; // "1 Week", "2 Weeks", etc.
  start_date: string;
  end_date?: string; // Auto-calculated
}

export interface UpdateSprintData {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status?: SprintStatus;
}

export interface SprintDashboardData {
  sprint: SprintWithStats;
  tasks: TaskWithDetails[];
  team_performance: TeamMemberPerformance[];
  burndown_data: BurndownPoint[];
  delay_alerts: DelayAlert[];
}

export interface TeamMemberPerformance {
  id: number;
  name: string;
  avatar?: string;
  active_tasks: number;
  completed_tasks: number;
  logged_hours: number;
  productivity: number;
  on_track: boolean;
  last_active: string;
}

export interface BurndownPoint {
  day: number;
  planned: number;
  actual: number;
}

export interface DelayAlert {
  id: number;
  type: string;
  task: string;
  assignee: string;
  overdue: string;
  severity: "low" | "medium" | "high";
}

export interface SprintMember {
  team_member_id: number;
  team_member_name?: string;
  role?: string; // e.g., "Developer", "Tester"
  assigned_tasks?: number;
  completed_tasks?: number;
  logged_hours?: number;
  avatar_url?: string;
  team_member_productivity_score?: number;
  sprint_productivity_score?: number;
}
