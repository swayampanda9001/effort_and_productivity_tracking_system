import type { BaseEntity, TaskStage, ApprovalStatus } from "./common"

export interface EffortLog extends BaseEntity {
  task_id: number
  team_member_id: number
  log_date: string
  time_spent_hours: number
  stage: TaskStage
  daily_update: string
  blockers?: string
  next_day_plan: string
  is_approved: boolean
  approved_by?: number
  approved_at?: string
}

export interface EffortLogWithDetails extends EffortLog {
  task: {
    id: number
    title: string
  }
  team_member: {
    id: number
    name: string
    avatar_url?: string
  }
  approver?: {
    id: number
    name: string
  }
}

export interface CreateEffortLogData {
  task_id: number
  log_date: string
  time_spent_hours: number
  stage: TaskStage
  daily_update: string
  blockers?: string
  next_day_plan: string
}

export interface UpdateEffortLogData {
  time_spent_hours?: number
  daily_update?: string
  blockers?: string
  next_day_plan?: string
}

export interface ApproveEffortLogData {
  is_approved: boolean
  comments?: string
}

export interface EffortLogApproval {
  id: number
  effort_log_id: number
  team_member: string
  task_title: string
  date: string
  time_spent: number
  activity: string
  daily_update: string
  blockers?: string
  submitted_at: string
  status: ApprovalStatus
}

export interface EffortLogStats {
  total_hours: number
  avg_daily_hours: number
  most_productive_day: string
  least_productive_day: string
  stage_distribution: Record<TaskStage, number>
}
