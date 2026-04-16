import type { TaskStatus } from "@/types/common";

/**
 * Formats a task status for display by converting underscores to spaces and capitalizing
 */
export function formatTaskStatus(status: TaskStatus): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Gets the appropriate badge variant color for a task status
 */
export function getTaskStatusColor(status: TaskStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "in_progress":
      return "secondary";
    case "blocked":
    case "overdue":
    case "cancelled":
      return "destructive";
    case "new":
    case "on_hold":
    case "review":
    default:
      return "outline";
  }
}

/**
 * Checks if a task can be modified based on its status and user role
 */
export function canModifyTask(status: TaskStatus, userRole: string): boolean {
  const restrictedStatuses: TaskStatus[] = ["completed", "blocked", "cancelled"];
  
  // Team members cannot modify restricted tasks at all
  if (userRole === "team_member" && restrictedStatuses.includes(status)) {
    return false;
  }
  
  // Managers can modify restricted tasks (but with limitations enforced by backend)
  return true;
}

/**
 * Gets the reason why a task cannot be modified
 */
export function getTaskModificationRestrictionReason(status: TaskStatus, userRole: string): string | null {
  const restrictedStatuses: TaskStatus[] = ["completed", "blocked", "cancelled"];
  
  if (userRole === "team_member" && restrictedStatuses.includes(status)) {
    return `Cannot modify ${formatTaskStatus(status).toLowerCase()} tasks. Only managers can make changes to ${formatTaskStatus(status).toLowerCase()} tasks.`;
  }
  
  return null;
}

/**
 * Checks if effort logging is allowed for a task based on its status
 */
export function canLogEffort(status: TaskStatus): boolean {
  const restrictedStatuses: TaskStatus[] = ["completed", "blocked", "cancelled"];
  return !restrictedStatuses.includes(status);
}

/**
 * Gets the reason why effort cannot be logged for a task
 */
export function getEffortLoggingRestrictionReason(status: TaskStatus): string | null {
  const restrictedStatuses: TaskStatus[] = ["completed", "blocked", "cancelled"];
  
  if (restrictedStatuses.includes(status)) {
    return `Cannot log effort for ${formatTaskStatus(status).toLowerCase()} tasks. Effort logging is disabled for ${formatTaskStatus(status).toLowerCase()} tasks.`;
  }
  
  return null;
}

  // Helper function to calculate overdue days
  export const getOverdueDays = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Helper function to get severity based on overdue days
  export const getSeverity = (overdueDays: number) => {
    if (overdueDays > 7) return "high";
    if (overdueDays > 3) return "medium";
    return "low";
  };

  // Helper function to check if task is overdue and get overdue info
  export const getTaskOverdueInfo = (task: any) => {
    if (task.status !== "in_progress" || !task.due_date) {
      return { isOverdue: false, overdueDays: 0 };
    }

    const today = new Date();
    const dueDate = new Date(task.due_date);
    
    // Reset time to start of day for accurate comparison
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) {
      const diffTime = today.getTime() - dueDate.getTime();
      const overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { isOverdue: true, overdueDays };
    }

    return { isOverdue: false, overdueDays: 0 };
  };