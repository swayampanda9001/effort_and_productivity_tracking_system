import type { UserRole } from "./common"

export interface NavigationProps {
  userRole: UserRole
  userName: string
  userEmail: string
}

export interface NavItem {
  href: string
  label: string
  icon: any // Lucide React icon component
  roles?: UserRole[]
}

export interface BreadcrumbItem {
  label: string
  href?: string
  isActive?: boolean
}
