import type { ActivityType, TaskStage } from "./common"

export interface DashboardStats {
  total_tasks: number
  completed_tasks: number
  active_tasks: number
  sprint_progress: number
  productivity_score: number
  effort_variance: number
  delay_alerts: number
  team_velocity: number
}

export interface CurrentSprintData {
  sprint_id: number
  name: string
  start_date: string
  end_date: string
  progress: number
  tasks_completed: number
  total_tasks: number
  estimated_effort: number
  actual_effort: number
  logged_effort: number
  days_remaining: number
  is_on_track: boolean
}

export interface PerformanceMetrics {
  productivity_score: number
  completion_rate: number
  estimation_accuracy: number
  delay_count: number
  rating: string
  trend: "up" | "down" | "stable"
}

export interface ActivityItem {
  id: number
  type: ActivityType
  description: string
  timestamp: string
  source: string
  user?: {
    id: number
    name: string
    avatar_url?: string
  }
}

export interface EffortAnalysis {
  estimated_hours: number
  actual_hours: number
  logged_hours: number
  variance: number
  accuracy_rate: number
  stage_distribution: Record<TaskStage, number>
}

export interface TeamPerformanceOverview {
  total_members: number
  active_members: number
  avg_productivity: number
  members_on_track: number
  members_behind: number
  top_performers: Array<{
    id: number
    name: string
    productivity: number
  }>
}

export interface SprintAnalytics {
  velocity: number
  burndown_rate: number
  completion_trend: Array<{
    date: string
    completed: number
    planned: number
  }>
  risk_assessment: {
    completion_probability: number
    risk_level: "low" | "medium" | "high"
    recommendations: string[]
  }
}
