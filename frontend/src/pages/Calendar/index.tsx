import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import API from "@/lib/axios/instance";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enIN } from "date-fns/locale";
// Importing styles

import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "react-big-calendar/lib/css/react-big-calendar.css";

// Custom calendar styling for dark theme with orange accent
const darkThemeStyles = `
  .rbc-calendar {
    background-color: #1a1a1a;
    color: #e5e5e5;
  }

  .rbc-header {
    background-color: #2a2a2a;
    color: #fff;
    padding: 12px 4px;
    font-weight: 600;
    border-color: #3a3a3a;
  }

  .rbc-today {
    background-color: #262626;
  }

  .rbc-off-range-bg {
    background-color: #1a1a1a;
  }

  .rbc-date-cell {
    padding: 4px;
  }

  .rbc-date-cell > a,
  .rbc-date-cell > span {
    color: #e5e5e5;
  }

  .rbc-month-view,
  .rbc-time-view {
    background-color: #1a1a1a;
    border-color: #3a3a3a;
  }

  .rbc-month-row {
    border-color: #3a3a3a;
    min-height: 120px;
  }

  .rbc-date-cell {
    border-color: #3a3a3a;
  }

  .rbc-event {
    background-color: hsl(25 95% 53%);
    border: none;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    color: #fff !important;
  }

  .rbc-event-label {
    color: #fff;
    font-weight: 500;
  }

  .rbc-event-content {
    color: #fff;
    font-weight: 500;
  }

  .rbc-toolbar {
    background-color: #2a2a2a;
    padding: 15px;
    gap: 10px;
    border-color: #3a3a3a;
    border-bottom: 1px solid #3a3a3a;
  }

  .rbc-toolbar button {
    background-color: hsl(25 95% 53%);
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .rbc-toolbar button:hover {
    background-color: hsl(25 95% 63%);
  }

  .rbc-toolbar button.rbc-active {
    background-color: hsl(25 95% 53%);
  }

  .rbc-toolbar button.rbc-off-range {
    background-color: #3a3a3a;
    color: #888;
  }

  .rbc-toolbar-label {
    color: #e5e5e5;
    font-size: 18px;
    font-weight: 600;
    flex-grow: 1;
  }

  .rbc-time-slot {
    background-color: #1a1a1a;
  }

  .rbc-time-header {
    background-color: #2a2a2a;
  }

  .rbc-timeslot-group {
    border-color: #3a3a3a;
    min-height: 60px;
  }

  .rbc-day-bg {
    background-color: #1a1a1a;
  }

  .rbc-current-time-indicator {
    background-color: hsl(25 95% 53%);
  }

  .rbc-selected {
    background-color: hsl(25 95% 43%);
  }

  .rbc-show-more {
    background-color: hsl(25 95% 53%);
    color: #fff;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .rbc-overlay {
    background-color: #2a2a2a;
    border-color: hsl(25 95% 53%);
    color: #e5e5e5;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .rbc-overlay-header {
    background-color: hsl(25 95% 53%);
    color: #fff;
    padding: 8px;
    border-radius: 4px 4px 0 0;
  }
`;

// Custom calendar styling for light theme with orange accent
const lightThemeStyles = `
  .rbc-calendar {
    background-color: #fff;
    color: #333;
  }

  .rbc-header {
    background-color: #f5f5f5;
    color: #333;
    padding: 12px 4px;
    font-weight: 600;
    border-color: #e0e0e0;
  }

  .rbc-today {
    background-color: #f0f0f0;
  }

  .rbc-off-range-bg {
    background-color: #fafafa;
  }

  .rbc-date-cell {
    padding: 4px;
  }

  .rbc-date-cell > a,
  .rbc-date-cell > span {
    color: #333;
  }

  .rbc-month-view,
  .rbc-time-view {
    background-color: #fff;
    border-color: #e0e0e0;
  }

  .rbc-month-row {
    border-color: #e0e0e0;
    min-height: 120px;
  }

  .rbc-date-cell {
    border-color: #e0e0e0;
  }

  .rbc-event {
    background-color: hsl(25 95% 53%);
    border: none;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    color: #fff !important;
  }

  .rbc-event-label {
    color: #fff;
    font-weight: 500;
  }

  .rbc-event-content {
    color: #fff;
    font-weight: 500;
  }

  .rbc-toolbar {
    background-color: #f5f5f5;
    padding: 15px;
    gap: 10px;
    border-color: #e0e0e0;
    border-bottom: 1px solid #e0e0e0;
  }

  .rbc-toolbar button {
    background-color: hsl(25 95% 53%);
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .rbc-toolbar button:hover {
    background-color: hsl(25 95% 63%);
  }

  .rbc-toolbar button.rbc-active {
    background-color: hsl(25 95% 53%);
  }

  .rbc-toolbar button.rbc-off-range {
    background-color: #e0e0e0;
    color: #999;
  }

  .rbc-toolbar-label {
    color: #333;
    font-size: 18px;
    font-weight: 600;
    flex-grow: 1;
  }

  .rbc-time-slot {
    background-color: #fff;
  }

  .rbc-time-header {
    background-color: #f5f5f5;
  }

  .rbc-timeslot-group {
    border-color: #e0e0e0;
    min-height: 60px;
  }

  .rbc-day-bg {
    background-color: #fff;
  }

  .rbc-current-time-indicator {
    background-color: hsl(25 95% 53%);
  }

  .rbc-selected {
    background-color: hsl(25 95% 43%);
  }

  .rbc-show-more {
    background-color: hsl(25 95% 53%);
    color: #fff;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .rbc-overlay {
    background-color: #fff;
    border-color: hsl(25 95% 53%);
    color: #333;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .rbc-overlay-header {
    background-color: hsl(25 95% 53%);
    color: #fff;
    padding: 8px;
    border-radius: 4px 4px 0 0;
  }
`;

interface TaskData {
  id: number;
  title: string;
  status: string;
  due_date: string;
  created_at: string;
  start_date?: string;
  sprint_id: number;
}

interface TaskEvent {
  id: string | number;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    id: number;
    title: string;
    status: string;
    due_date: string;
    created_at: string;
    sprint_id: number;
  };
}

// Error boundary for calendar rendering
class CalendarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Calendar error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-red-600 font-bold">Calendar Error</p>
            <p className="text-sm text-gray-600">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }

    return <div className="p-4">{this.props.children}</div>;
  }
}

export default function CalendarPage() {
  const navigate = useNavigate();

  // Inject custom calendar styles
  React.useEffect(() => {
    // Get theme from localStorage
    const savedTheme = localStorage.getItem("theme") || "dark";

    // Generate styles based on theme
    const isDarkTheme = savedTheme === "dark";
    const styles = isDarkTheme ? darkThemeStyles : lightThemeStyles;

    const style = document.createElement("style");
    style.textContent = styles;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Fetch incomplete tasks for current team member
  const { data: incompleteTasks = [], isLoading } = useQuery({
    queryKey: ["incomplete-tasks"],
    queryFn: async () => {
      const response = await API.get("/tasks/team-member/incomplete-tasks");
      console.log(`Incomplete tasks: ${JSON.stringify(response.data)}`);
      return response.data;
    },
  });

  const [events, setEvents] = useState<TaskEvent[]>([]);

  // Update events when incomplete tasks change
  React.useEffect(() => {
    const newEvents: TaskEvent[] = incompleteTasks
      .filter((task: TaskData) => {
        // Use start_date if available, otherwise use created_at
        const eventStartDate = task.start_date || task.created_at;
        // Validate that dates are valid
        const startDate = new Date(eventStartDate);
        const endDate = new Date(task.due_date);
        return !isNaN(startDate.getTime()) && !isNaN(endDate.getTime());
      })
      .map((task: TaskData) => {
        // Use start_date if available, otherwise use created_at
        const eventStartDate = task.start_date || task.created_at;
        // Parse the start date (or created_at as fallback) and due_date as end
        const startDate = new Date(eventStartDate);
        const endDate = new Date(task.due_date);

        return {
          id: task.id,
          title: task.title,
          start: startDate,
          end: endDate,
          resource: task,
        };
      });

    setEvents(newEvents);
  }, [incompleteTasks]);

  // Handle event click to navigate to task detail
  const onSelectEvent = (event: TaskEvent) => {
    if (event.resource?.id && event.resource?.sprint_id) {
      navigate(
        `/dashboard/team_member/sprints/${event.resource.sprint_id}/task/${event.resource.id}`
      );
    }
  };

  const DnDCalendar = withDragAndDrop(Calendar);
  const locales = {
    "en-IN": enIN,
  };
  // The types here are `object`. Strongly consider making them better as removing `locales` caused a fatal error
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
  });

  // Custom event style getter for color coding
  const eventStyleGetter = (event: TaskEvent) => {
    const task = event.resource;

    if (!task) {
      return { style: {} };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);

    let backgroundColor = "hsl(220 13% 91%)"; // Default light gray
    let borderColor = "hsl(220 13% 91%)";

    // If current date is greater than due date and task is not completed, make it red
    if (today > dueDate && task.status !== "completed") {
      backgroundColor = "hsl(0 84% 60%)"; // Red
      borderColor = "hsl(0 84% 60%)";
    }
    // If task is not completed, make it yellow
    else if (task.status !== "completed") {
      backgroundColor = "hsl(48 96% 53%)"; // Yellow
      borderColor = "hsl(48 96% 53%)";
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        borderRadius: "5px",
        opacity: 1,
        color: "#fff",
        border: `2px solid ${borderColor}`,
        display: "block",
      },
    };
  };

  const onEventResize = (data: {
    start: Date | string;
    end: Date | string;
  }) => {
    const { start, end } = data;

    setEvents((currentEvents) => {
      const newEvent: TaskEvent = {
        id: Math.random(),
        title: "New Event",
        start: new Date(start),
        end: new Date(end),
      };
      return [...currentEvents, newEvent];
    });
  };

  const onEventDrop = (data: {
    event: object;
    start: Date | string;
    end: Date | string;
  }) => {
    console.log(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading calendar...</p>
      </div>
    );
  }

  return (
    <CalendarErrorBoundary>
      <div className="">
        <DnDCalendar
          defaultView="month"
          events={events as object[]}
          localizer={localizer}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          onSelectEvent={(event: object) => onSelectEvent(event as TaskEvent)}
          resizable
          style={{ height: "100vh" }}
          eventPropGetter={(event: object) =>
            eventStyleGetter(event as TaskEvent)
          }
        />
      </div>
    </CalendarErrorBoundary>
  );
}
