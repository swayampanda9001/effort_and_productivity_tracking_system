import { useState } from "react";
import API from "@/lib/axios/instance";
import type { TeamMember } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { useTeamMembersStore } from "@/lib/zustand/teamMembers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AddTeamMember from "@/components/dialogs/AddTeamMember";
import TeamMemberProductivityDialog from "@/components/dialogs/TeamMemberProductivityDialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function TeamOverview() {
  const { teamMembers, setTeamMembers, addTeamMember } = useTeamMembersStore();
  const [showTeamMembersDialog, setShowTeamMembersDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showProductivityDialog, setShowProductivityDialog] = useState(false);

  const fetchTeamMembers = async () => {
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
  const { isLoading } = useQuery({
    queryKey: ["teamMembers"],
    queryFn: fetchTeamMembers,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading team members...</p>
      </div>
    );
  }

  const handleAddMember = (newMembers: TeamMember[]) => {
    newMembers.forEach((member) => {
      addTeamMember(member);
    });
  };

  const handleViewDetails = (member: TeamMember) => {
    setSelectedMember(member);
    setShowProductivityDialog(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "delayed":
        return "bg-red-500";
      case "inactive":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  // Prepare data for the bar chart
  const chartData = teamMembers
    .map((member) => ({
      name: member.full_name?.split(" ")[0] || "Unknown", // Use first name for cleaner display
      fullName: member.full_name,
      score: member.productivity_score || 0,
      userId: member.user_id,
      member: member, // Store full member object for click handler
    }))
    .sort((a, b) => b.score - a.score); // Sort by score descending

  // Get color based on productivity score
  const getBarColor = (score: number) => {
    if (score >= 80) return "#10b981"; // green-500
    if (score >= 60) return "#f59e0b"; // yellow-500
    if (score >= 40) return "#f97316"; // orange-500
    return "#ef4444"; // red-500
  };

  // Handle bar click to show details
  const handleBarClick = (data: any) => {
    if (data && data.member) {
      handleViewDetails(data.member);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team Overview</h1>
          <p className="text-muted-foreground mt-2">
            Monitor team performance and manage sprints
          </p>
        </div>
        <AddTeamMember
          onAddMembers={handleAddMember}
          onOpenChange={setShowTeamMembersDialog}
          isOpen={showTeamMembersDialog}
        />
      </div>

      {/* Productivity Comparison Chart */}
      {teamMembers?.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Team Productivity Comparison</CardTitle>
            <CardDescription>
              Click on any bar to view detailed productivity breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  label={{
                    value: "Productivity Score",
                    angle: -90,
                    position: "insideLeft",
                  }}
                  domain={[0, 100]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">{data.fullName}</p>
                          <p className="text-sm text-muted-foreground">
                            Productivity Score:{" "}
                            <span className="font-bold">{data.score}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Click to view details
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="score"
                  name="Productivity Score"
                  cursor="pointer"
                  onClick={handleBarClick}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getBarColor(entry.score)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {teamMembers?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">
                  No team members yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Start building your team by adding the first member
                </p>
                <AddTeamMember
                  onAddMembers={handleAddMember}
                  onOpenChange={setShowTeamMembersDialog}
                  isOpen={showTeamMembersDialog}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          teamMembers?.map((member, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        className="object-cover"
                        src={
                          `${import.meta.env.VITE_R2_BASE_URL}${
                            member?.avatar_url
                          }` || "/placeholder.svg"
                        }
                      />
                      <AvatarFallback>
                        {member?.full_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">
                        {member?.full_name}
                      </CardTitle>
                      <CardDescription>{member?.email}</CardDescription>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(member)}
                    >
                      View Details
                    </Button>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          member?.is_active === 1 ? "default" : "destructive"
                        }
                      >
                        {member.is_active === 1 ? "Active" : "Inactive"}
                      </Badge>
                      <div
                        className={`w-3 h-3 rounded-full ${getStatusColor(
                          member.is_active === 1 ? "active" : "inactive"
                        )}`}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {member.active_tasks}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Active Tasks
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {member.completed_tasks}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Completed
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-500">
                      {member.total_logged_hours === "0.00"
                        ? 0
                        : member.total_logged_hours}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Logged Hours
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {member?.productivity_score}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Productivity Score
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Productivity Dialog */}
      <TeamMemberProductivityDialog
        open={showProductivityDialog}
        onOpenChange={setShowProductivityDialog}
        teamMember={selectedMember}
      />
    </div>
  );
}
