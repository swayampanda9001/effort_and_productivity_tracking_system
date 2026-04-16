import { type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import { useAuth } from "@/contexts/AuthContext";
import { useSprintStore } from "@/lib/zustand/sprints";
import { useTasksStore } from "@/lib/zustand/tasks";
import { useTeamMembersStore } from "@/lib/zustand/teamMembers";
import { Navigation } from "@/components/Navigation";
import { NotificationProvider } from "@/contexts/NotificationContext.tsx";
// import { SprintWithStats } from "@/types/sprint";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const { teamMembers, setTeamMembers } = useTeamMembersStore();
  const { activeSprint, setActiveSprint, sprints, setSprints } =
    useSprintStore();
  const { setActiveSprintTasks } = useTasksStore();

  const fetchTeamMembers = async () => {
    if (user?.role === "team_member") {
      return [];
    }
    if (teamMembers.length > 0) {
      console.log("Using cached team members:", teamMembers);
      return teamMembers;
    }
    try {
      const response = await API.get("/team-members");
      console.log("Fetched team members:", response.data);
      setTeamMembers(response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching team members:", error);
      throw error;
    }
  };

  const fetchSprints = async () => {
    // if (user?.role === "team_member") {
    //   return [];
    // }
    if (sprints.length > 0) {
      console.log("Using cached sprints:", sprints);
      return sprints;
    }
    try {
      const response = await API.get("/sprints");
      console.log("Fetched sprints:", response.data);
      // Find an active sprint or use the latest one
      const activeSprint_ =
        response.data.find((sprint: any) => sprint.status === "active") ||
        (response.data.length > 0
          ? response.data.reduce(
              (latest: any, sprint: any) =>
                new Date(sprint.created_at) > new Date(latest.created_at)
                  ? sprint
                  : latest,
              response.data[0]
            )
          : null);
      if (activeSprint_) {
        console.log("Setting active sprint:", activeSprint_);
        setActiveSprint(activeSprint_);
      }
      setSprints(response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching sprints:", error);
      throw error;
    }
  };

  const fetchActiveSprintTasks = async () => {
    if (!activeSprint) {
      return [];
    }
    try {
      const response = await API.get(
        `/tasks/?skip=0&limit=100&sprint_id=${activeSprint.id}`
      );
      console.log("Fetched active sprint tasks:", response.data);
      setActiveSprintTasks(response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching active sprint tasks:", error);
      throw error;
    }
  };

  const userDataQueries = useQueries({
    queries: [
      {
        queryKey: ["teamMembers"],
        queryFn: fetchTeamMembers,
      },
      {
        queryKey: ["sprints"],
        queryFn: fetchSprints,
      },
      {
        queryKey: ["activeSprintTasks"],
        queryFn: fetchActiveSprintTasks,
        enabled: !!activeSprint,
      },
    ],
  });

  if (userDataQueries.some((query) => query.isLoading)) {
    return <div>Loading...</div>;
  }

  if (userDataQueries.some((query) => query.isError)) {
    return <div>Error loading data</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {user && (
        <NotificationProvider>
          <Navigation
            userRole={user.role}
            userName={user?.full_name}
            userEmail={user?.email}
            userAvatar={user?.avatar_url || "placeholder.svg"}
          />
        </NotificationProvider>
      )}
      {children}
    </div>
  );
};

export default DashboardLayout;
