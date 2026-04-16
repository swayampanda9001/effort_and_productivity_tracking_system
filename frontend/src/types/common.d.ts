// Common types used across the application
export type UserRole = "team_member" | "pm" | "sm"

export type TaskStatus = "new" | "in_progress" | "on_hold" | "review" | "completed" | "overdue" | "blocked" | "cancelled"

export type TaskPriority = "low" | "medium" | "high"

export type TaskStage = "analysis" | "development" | "testing" | "review" | "deployment"

export type SprintStatus = "planning" | "active" | "completed" | "cancelled" | "on_hold"

export type CommentType = "general" | "review" | "feedback" | "question" | "blocker" | "suggestion"

export type ActivityType = "task_completed" | "effort_logged" | "comment_added" | "status_updated" | "task_created"

export type ApprovalStatus = "pending" | "approved" | "rejected"

export interface BaseEntity {
  id: number
  created_at: string
  updated_at: string
}

export interface PaginationParams {
  page?: number
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  has_next: boolean
  has_prev: boolean
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface FilterOptions {
  status?: TaskStatus[]
  priority?: TaskPriority[]
  assignee?: number[]
  stage?: TaskStage[]
  date_from?: string
  date_to?: string
}
