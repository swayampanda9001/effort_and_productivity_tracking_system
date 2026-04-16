import type { Sprint } from "@/types/sprint";

export const formatSprintTitle = (sprint: Sprint) => {
  return `${sprint.name} - ${sprint.duration} Weeks - ${new Date(
    sprint.start_date
  ).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} to ${new Date(sprint.end_date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
};

export const getTodaysDate = (): string => {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const day = String(today.getDate()).padStart(2, "0");

  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
};
