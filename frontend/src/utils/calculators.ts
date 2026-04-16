export const convertTimeToAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  } else if (diffInSeconds < 2592000) {
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  } else if (diffInSeconds < 31536000) {
    return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  } else {
    return `${Math.floor(diffInSeconds / 31536000)} years ago`;
  }
};

export function calculateEstimatedEffortHours(
  startDateStr: string,
  endDateStr: string
): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    throw new Error("Invalid dates");
  }

  let workDays = 0;
  let current = new Date(start);

  while (current <= end) {
    const day = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      workDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workDays * 8;
}

export function calculateActualEffortHoursTillToday(
  startDateStr: string
): number {
  const start = new Date(startDateStr);
  const today = new Date();

  if (isNaN(start.getTime()) || today < start) {
    return 0;
  }

  let workDays = 0;
  const current = new Date(start);

  while (current <= today) {
    const day = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      workDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workDays * 8;
}

export const remainingDaysCalculator = (
  startDateStr: string,
  endDateStr: string
): number => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const today = new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    throw new Error("Invalid dates");
  }

  if (today < start) {
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  } else if (today > end) {
    return 0;
  } else {
    let remainingDays = 0;
    let current = new Date(today);

    while (current <= end) {
      const day = current.getDay(); // 0 = Sunday, 6 = Saturday
      if (day !== 0 && day !== 6) {
        remainingDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    return remainingDays;
  }
};

export function calculateSprintProgress(
  completedTasks: number | undefined,
  totalTasks: number | undefined
): number {
  if (
    totalTasks === 0 ||
    completedTasks === undefined ||
    totalTasks === undefined
  ) {
    return 0;
  }
  const progress = (completedTasks / totalTasks) * 100;
  return Number(Math.min(Math.max(progress, 0), 100).toFixed(0));
}
