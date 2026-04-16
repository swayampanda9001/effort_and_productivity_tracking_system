import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import { formatSprintTitle } from "@/utils/Formatter";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Target, Clock } from "lucide-react";
import CreateSprintDialog from "@/components/dialogs/CreateSprint";
import { useSprintStore } from "@/lib/zustand/sprints";
import {
  calculateEstimatedEffortHours,
  calculateSprintProgress,
} from "@/utils/calculators";

export default function SprintsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sprints, setSprints } = useSprintStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchSprints = async () => {
    if (sprints.length > 0) {
      console.log("Using cached sprints:", sprints);
      return sprints;
    }
    try {
      const response = await API.get("/sprints");
      console.log("Fetched sprints:", response.data);
      setSprints(response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching sprints:", error);
      throw error;
    }
  };

  const { isLoading, refetch } = useQuery({
    queryKey: ["sprints"],
    queryFn: fetchSprints,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if(sprints.length === 0 && user?.role === "team_member") {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>No active sprint found. Please contact your manager.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Sprint Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Create and manage development sprints
          </p>
        </div>
        {user?.role !== "team_member" && (
          <CreateSprintDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            onSprintCreated={() => refetch()}
          />
        )}
      </div>

      {/* <ManagerTabs /> */}

      <div className="grid gap-6">
        {sprints.map((sprint) => (
          <Card key={sprint.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start gap-4 justify-between flex-wrap">
                <div className="space-y-1">
                  <CardTitle className="text-xl">
                    {formatSprintTitle(sprint)}
                  </CardTitle>
                  <CardDescription>{sprint.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      sprint.status === "active" &&
                      new Date(sprint.end_date) > new Date()
                        ? "default"
                        : sprint.status === "active" &&
                          new Date(sprint.end_date) < new Date()
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {sprint.status === "active" &&
                    new Date(sprint.end_date) > new Date()
                      ? sprint?.status.charAt(0).toUpperCase() +
                        sprint?.status.slice(1)
                      : sprint.status === "active" &&
                        new Date(sprint.end_date) < new Date()
                      ? "Delayed"
                      : sprint?.status.charAt(0).toUpperCase() +
                        sprint?.status.slice(1)}
                  </Badge>
                  {/* <Button variant="ghost" size="icon">
                    <Edit className="h-4 w-4" />
                  </Button> */}
                  {/* {
                    user?.role !== "team_member" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          // Handle delete sprint logic here
                          console.log("Delete sprint:", sprint.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )
                  } */}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">
                      {sprint?.total_tasks}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Tasks
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">
                      {sprint?.completed_tasks}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Completed
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">
                      {sprint?.planned_effort_hours || 0}h
                      {/* <span className="text-xs text-muted-foreground font-light">
                        {" "}
                        of{" "}
                        {calculateEstimatedEffortHours(
                          sprint.start_date,
                          sprint.end_date
                        )}{" "}
                        h
                      </span> */}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {/* {sprint.status === "active"
                        ? "Logged Efforts"
                        : "Actual Efforts"} */}
                      Planned Efforts
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                    <Users className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">
                      {sprint?.sprint_members?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Sprint Members
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Sprint Progress</span>
                  <span className="text-sm text-muted-foreground">
                    {sprint.completed_tasks} of {sprint.total_tasks} tasks
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${calculateSprintProgress(
                        sprint.completed_tasks,
                        sprint.total_tasks
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={() =>
                    navigate(
                      `/dashboard/${user?.role}/sprints/${sprint.id}?tab=tasks`
                    )
                  }
                  variant="outline"
                  size="sm"
                >
                  View Tasks
                </Button>
                <Button
                  onClick={() =>
                    navigate(`/dashboard/${user?.role}/sprints/${sprint.id}`)
                  }
                  size="sm"
                >
                  Manage Sprint
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
