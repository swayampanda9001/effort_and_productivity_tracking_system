/**
 * Velocity Calculator Utilities
 * 
 * This module provides functions to calculate team velocity metrics
 * for sprint planning and performance tracking.
 */

export interface VelocityData {
  taskVelocity: string;
  effortVelocity: string;
  sprintDuration: number;
  completedTasks: number;
  completedEffortHours: number;
  totalTasks: number;
}

export interface VelocityTrend {
  trend: "up" | "down" | "neutral";
  percentage: string;
  direction: string;
}

export interface HistoricalVelocity {
  avgTaskVelocity: string;
  avgEffortVelocity: string;
  sprintCount: number;
  totalDays: number;
}

export interface MemberVelocity {
  taskVelocity: string;
  effortVelocity: string;
  completedTasks: number;
  totalTasks: number;
  completionRate: string;
}

/**
 * Calculate the duration of a sprint in days
 */
export const calculateSprintDuration = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Calculate task velocity (tasks completed per day)
 */
export const calculateTaskVelocity = (completedTasks: number, sprintDurationDays: number): string => {
  return sprintDurationDays > 0 ? (completedTasks / sprintDurationDays).toFixed(1) : "0.0";
};

/**
 * Calculate effort velocity (effort hours completed per day)
 */
export const calculateEffortVelocity = (completedEffortHours: number, sprintDurationDays: number): string => {
  return sprintDurationDays > 0 ? (completedEffortHours / sprintDurationDays).toFixed(1) : "0.0";
};

/**
 * Calculate story point velocity (story points completed per sprint)
 */
export const calculateStoryPointVelocity = (completedStoryPoints: number, sprintCount: number = 1): string => {
  return sprintCount > 0 ? (completedStoryPoints / sprintCount).toFixed(1) : "0.0";
};

/**
 * Calculate team velocity based on current sprint data
 */
export const calculateCurrentSprintVelocity = (sprint: any, tasks: any[]): VelocityData => {
  if (!sprint || !tasks.length) {
    return {
      taskVelocity: "0.0",
      effortVelocity: "0.0",
      sprintDuration: 0,
      completedTasks: 0,
      completedEffortHours: 0,
      totalTasks: 0
    };
  }

  const sprintDuration = calculateSprintDuration(sprint.start_date, sprint.end_date);
  const completedTasks = tasks.filter(task => task.status === "completed").length;
  const completedEffortHours = tasks
    .filter(task => task.status === "completed")
    .reduce((sum, task) => sum + (task.logged_effort_hours || 0), 0);

  return {
    taskVelocity: calculateTaskVelocity(completedTasks, sprintDuration),
    effortVelocity: calculateEffortVelocity(completedEffortHours, sprintDuration),
    sprintDuration,
    completedTasks,
    completedEffortHours,
    totalTasks: tasks.length
  };
};

/**
 * Calculate velocity trend comparing current vs previous sprint
 */
export const calculateVelocityTrend = (currentVelocity: number, previousVelocity: number = 8.5): VelocityTrend => {
  if (previousVelocity <= 0) {
    return { trend: "neutral", percentage: "0", direction: "" };
  }

  const change = ((currentVelocity - previousVelocity) / previousVelocity) * 100;

  return {
    trend: change > 5 ? "up" : change < -5 ? "down" : "neutral",
    percentage: Math.abs(change).toFixed(1),
    direction: change > 0 ? "+" : change < 0 ? "-" : ""
  };
};

/**
 * Calculate historical velocity across multiple sprints
 */
export const calculateHistoricalVelocity = (sprints: any[]): HistoricalVelocity => {
  const completedSprints = sprints.filter(s => s.status === "completed");
  
  if (completedSprints.length === 0) {
    return { avgTaskVelocity: "0.0", avgEffortVelocity: "0.0", sprintCount: 0, totalDays: 0 };
  }

  const totalTasks = completedSprints.reduce((sum, sprint) => sum + (sprint.completed_tasks || 0), 0);
  const totalEffort = completedSprints.reduce((sum, sprint) => sum + (sprint.total_logged_effort || 0), 0);
  const totalDays = completedSprints.reduce((sum, sprint) => 
    sum + calculateSprintDuration(sprint.start_date, sprint.end_date), 0);

  return {
    avgTaskVelocity: totalDays > 0 ? (totalTasks / totalDays).toFixed(1) : "0.0",
    avgEffortVelocity: totalDays > 0 ? (totalEffort / totalDays).toFixed(1) : "0.0",
    sprintCount: completedSprints.length,
    totalDays
  };
};

/**
 * Calculate individual team member velocity
 */
export const calculateMemberVelocity = (member: any, tasks: any[], sprintDuration: number): MemberVelocity => {
  const memberTasks = tasks.filter(task => 
    task.assigned_to_name === member.name || task.assigned_to_id === member.id
  );
  const completedTasks = memberTasks.filter(task => task.status === "completed");
  const totalEffort = completedTasks.reduce((sum, task) => sum + (task.logged_effort_hours || 0), 0);

  return {
    taskVelocity: sprintDuration > 0 ? (completedTasks.length / sprintDuration).toFixed(1) : "0.0",
    effortVelocity: sprintDuration > 0 ? (totalEffort / sprintDuration).toFixed(1) : "0.0",
    completedTasks: completedTasks.length,
    totalTasks: memberTasks.length,
    completionRate: memberTasks.length > 0 ? ((completedTasks.length / memberTasks.length) * 100).toFixed(1) : "0.0"
  };
};

/**
 * Predict sprint completion based on current velocity
 */
export const predictSprintCompletion = (remainingTasks: number, currentVelocity: number): string => {
  if (currentVelocity === 0) return "Cannot predict";
  
  const daysNeeded = Math.ceil(remainingTasks / currentVelocity);
  return `${daysNeeded} ${daysNeeded === 1 ? 'day' : 'days'} at current velocity`;
};

/**
 * Calculate burndown rate (tasks remaining vs time remaining)
 */
export const calculateBurndownRate = (remainingTasks: number, remainingDays: number): string => {
  if (remainingDays <= 0) return "Sprint ended";
  
  const requiredVelocity = remainingTasks / remainingDays;
  return requiredVelocity.toFixed(1);
};

/**
 * Calculate velocity variance (how consistent the team's velocity is)
 */
export const calculateVelocityVariance = (velocities: number[]): { variance: number, consistency: string } => {
  if (velocities.length === 0) return { variance: 0, consistency: "No data" };
  
  const mean = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
  const squaredDiffs = velocities.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / velocities.length;
  
  let consistency = "High";
  if (variance > 4) consistency = "Low";
  else if (variance > 1) consistency = "Medium";
  
  return { variance: Number(variance.toFixed(2)), consistency };
};

/**
 * Get velocity performance rating
 */
export const getVelocityPerformanceRating = (currentVelocity: number, targetVelocity: number): {
  rating: string;
  percentage: number;
  status: "excellent" | "good" | "average" | "poor";
} => {
  if (targetVelocity <= 0) {
    return { rating: "No target set", percentage: 0, status: "average" };
  }

  const percentage = (currentVelocity / targetVelocity) * 100;
  
  let rating = "Poor";
  let status: "excellent" | "good" | "average" | "poor" = "poor";
  
  if (percentage >= 120) {
    rating = "Excellent";
    status = "excellent";
  } else if (percentage >= 100) {
    rating = "Good";
    status = "good";
  } else if (percentage >= 80) {
    rating = "Average";
    status = "average";
  }

  return { rating, percentage: Number(percentage.toFixed(1)), status };
};
