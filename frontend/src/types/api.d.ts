import type { PaginationParams } from "./common"

// API Request types
export interface ApiRequestConfig {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  headers?: Record<string, string>
  params?: Record<string, any>
  data?: any
}

// API Error types
export interface ApiError {
  message: string
  status: number
  code?: string
  details?: any
}

// Generic API hooks return types
export interface UseQueryResult<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  refetch: () => Promise<void>
}

export interface UseMutationResult<T, V = any> {
  mutate: (variables: V) => Promise<T>
  loading: boolean
  error: ApiError | null
  reset: () => void
}

// Specific API endpoint types
export interface GetTasksParams extends PaginationParams {
  status?: string
  assignee?: number
  sprint_id?: number
  search?: string
}

export interface GetEffortLogsParams extends PaginationParams {
  task_id?: number
  team_member_id?: number
  date_from?: string
  date_to?: string
  is_approved?: boolean
}

export interface GetCommentsParams extends PaginationParams {
  task_id: number
}

export interface GetSprintsParams extends PaginationParams {
  status?: string
  created_by?: number
}

// WebSocket types
export interface WebSocketMessage {
  type: string
  payload: any
  timestamp: string
}

export interface RealTimeUpdate {
  entity_type: "task" | "effort_log" | "comment" | "sprint"
  entity_id: number
  action: "created" | "updated" | "deleted"
  data: any
  user_id: number
}
