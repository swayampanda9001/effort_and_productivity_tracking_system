import type { UserRole } from "./common"

export interface LoginCredentials {
  username: string
  password: string
}

export interface RegisterData {
  username: string
  email: string
  password: string
  full_name: string
  role?: UserRole
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

export interface AuthUser {
  id: number
  username: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  email_verified: boolean
  avatar_url?: string
  last_login?: string
}

export interface TokenPayload {
  sub: string
  exp: number
  iat: number
  user_id: number
  role: UserRole
}

export interface PasswordChangeData {
  current_password: string
  new_password: string
  confirm_password: string
}
