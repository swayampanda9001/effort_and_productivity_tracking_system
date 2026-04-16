import type { BaseEntity, TaskStatus, TaskPriority, TaskStage } from "./common";

export interface TeamMemberAssignment {
  team_member_id: number;
  assignment_type:
    | "developer"
    | "tester"
    | "reviewer"
    | "project_manager"
    | "team_lead";
  full_name: string;
  email?: string;
  avatar_url?: string;
  assigned_at?: string;
  completed?: boolean;
}

export interface Task extends BaseEntity {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  stage: TaskStage;
  estimated_effort_hours: number;
  logged_effort_hours: number;
  actual_effort_hours: number;
  due_date?: string;
  completion_date?: string;
  sprint_id?: number;
  created_by: number;
  tags?: string[];
  // Backward compatibility fields
  assigned_to?: number;
  assigned_to_name?: string;
  avatar_url?: string;
  // New assignment structure
  assignments?: TeamMemberAssignment[];
}

export interface TaskAssignment extends BaseEntity {
  task_id: number;
  assigned_by: number;
  team_members: Record<string, number[]>; // JSON structure: {'developer':[1,2], 'tester':[3], 'reviewer':[4], 'project_manager':[5], 'team_lead':[6]}
  assigned_at: string;
  is_active: boolean;
}

export interface TaskWithDetails extends Task {
  assignee?: {
    id: number;
    name: string;
    avatar_url?: string;
  };
  creator: {
    id: number;
    name: string;
  };
  sprint?: {
    id: number;
    name: string;
  };
  assignments?: TeamMemberAssignment[];
  progress: number;
  blockers_count: number;
  comments_count: number;
  last_update?: string;
}

export interface AssignmentInput {
  team_member_id: string;
  team_member_name?: string;
  assignment_type:
    | "developer"
    | "tester"
    | "reviewer"
    | "project_manager"
    | "team_lead";
}

export interface CreateTaskData {
  title: string;
  description?: string;
  priority: TaskPriority;
  estimated_effort_hours: number;
  due_date?: string;
  sprint_id?: number;
  // Backward compatibility
  assigned_to?: number;
  // New assignment structure
  assignments?: AssignmentInput[];
  tags?: string[];
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  current_stage?: TaskStage;
  estimated_effort_hours?: number;
  due_date?: string;
  tags?: string[];
}

export interface BulkTaskData {
  title: string;
  assignee?: string;
  priority?: TaskPriority;
  estimated_effort?: number;
}
