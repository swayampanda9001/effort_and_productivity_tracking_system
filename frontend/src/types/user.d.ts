import type { BaseEntity, UserRole } from "./common"

export interface User extends BaseEntity {
  username: string
  email: string
  full_name: string
  avatar_url?: string
  role: UserRole
  is_active: number | boolean
  email_verified?: number | boolean
  avatar_url?: string
  last_login?: string
}

export interface TeamMember extends User {
  user_id: number
  employee_id: string
  department: string
  position: string
  manager_id?: number
  hire_date: string
  skills: string[] // JSON array
  active_tasks?: number
  completed_tasks?: number
  productivity_score?: number
  total_logged_hours?: number | string
  total_completed_tasks?: number
}

export interface UserProfile extends User {
  team_member?: TeamMember
  manager?: {
    id: number
    full_name: string
    email: string
    position: string
  }
}

export interface UserStats {
  active_tasks?: number
  completed_tasks?: number
  logged_hours?: number
  productivity_score?: number
  completion_rate?: number
  estimation_accuracy?: number
}

export interface TeamMemberWithStats extends TeamMember {
  user: User
  stats: UserStats
  is_on_track: boolean
  last_update: string
  status: "active" | "delayed" | "inactive"
}

export interface UpdateUserData {
  full_name?: string
  email?: string
  avatar_url?: string
}

export interface UpdateTeamMemberData {
  employee_id?: string
  department?: string
  position?: string
  skills?: string[]
}
