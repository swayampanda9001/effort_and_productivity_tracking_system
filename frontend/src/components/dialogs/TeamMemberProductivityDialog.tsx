import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import API from "@/lib/axios/instance";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamMember } from "@/types/user";

// interface TeamMember {
//   id: number;
//   full_name: string;
//   email: string;
//   avatar_url?: string;
//   productivity_score?: number;
//   total_logged_hours: string;
//   completed_tasks: number;
//   active_tasks: number;
//   is_active: number;
// }

interface SprintProductivity {
  sprint_id: number;
  sprint_name: string;
  sprint_score: number;
  overall_score: number;
  start_date: string;
  end_date: string;
  status: string;
}

interface TeamMemberProductivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMember: TeamMember | null;
}

export default function TeamMemberProductivityDialog({
  open,
  onOpenChange,
  teamMember,
}: TeamMemberProductivityDialogProps) {
  const [sprintData, setSprintData] = useState<SprintProductivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && teamMember) {
      fetchSprintProductivity();
    }
  }, [open, teamMember]);

  const fetchSprintProductivity = async () => {
    if (!teamMember) return;

    setIsLoading(true);
    try {
      const response = await API.get(
        `/team-members/${teamMember.user_id}/sprint-productivity`
      );
      console.log("Sprint productivity data:", response.data);
      setSprintData(response.data);
    } catch (error) {
      console.error("Error fetching sprint productivity:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const chartData = sprintData
    .filter((sprint) => sprint.sprint_score !== null) // Exclude sprints with NULL scores
    .map((sprint) => ({
      name: sprint.sprint_name,
      sprintScore: sprint.sprint_score,
      overallScore: sprint.overall_score,
      difference: sprint.sprint_score - sprint.overall_score,
    }));

  const sprintsWithScores = sprintData.filter((s) => s.sprint_score !== null);
  const averageSprintScore =
    sprintsWithScores.length > 0
      ? Math.round(
          sprintsWithScores.reduce((sum, s) => sum + s.sprint_score, 0) /
            sprintsWithScores.length
        )
      : 0;

  const highestScore =
    sprintsWithScores.length > 0
      ? Math.max(...sprintsWithScores.map((s) => s.sprint_score))
      : 0;
  const lowestScore =
    sprintsWithScores.length > 0
      ? Math.min(...sprintsWithScores.map((s) => s.sprint_score))
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage
                className="object-cover"
                src={
                  teamMember?.avatar_url
                    ? `${import.meta.env.VITE_R2_BASE_URL}${
                        teamMember.avatar_url
                      }`
                    : "/placeholder.svg"
                }
              />
              <AvatarFallback>
                {teamMember?.full_name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-xl">{teamMember?.full_name}</div>
              <div className="text-sm font-normal text-muted-foreground">
                {teamMember?.email}
              </div>
            </div>
            <Badge
              variant={teamMember?.is_active === 1 ? "default" : "destructive"}
              className="ml-auto"
            >
              {teamMember?.is_active === 1 ? "Active" : "Inactive"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Productivity performance analysis across sprints
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p>Loading productivity data...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Overall Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {teamMember?.productivity_score || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Average Sprint Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {averageSprintScore}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Highest Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {highestScore}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Lowest Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {lowestScore}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            {sprintData.length > 0 ? (
              <Tabs defaultValue="line" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="line">Trend</TabsTrigger>
                  <TabsTrigger value="bar">Comparison</TabsTrigger>
                  <TabsTrigger value="difference">Performance Gap</TabsTrigger>
                </TabsList>

                <TabsContent value="line" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Productivity Trend Across Sprints</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="sprintScore"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            name="Sprint Score"
                            activeDot={{ r: 8 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="overallScore"
                            stroke="#10b981"
                            strokeWidth={2}
                            name="Overall Score"
                            strokeDasharray="5 5"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="bar" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Sprint vs Overall Score Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Bar
                            dataKey="sprintScore"
                            fill="#3b82f6"
                            name="Sprint Score"
                          />
                          <Bar
                            dataKey="overallScore"
                            fill="#10b981"
                            name="Overall Score"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="difference" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Gap Analysis</CardTitle>
                      <DialogDescription>
                        Positive values indicate sprint performance above
                        overall average
                      </DialogDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar
                            dataKey="difference"
                            fill="#8b5cf6"
                            name="Performance Gap"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold mb-2">
                      No Sprint Data Available
                    </h3>
                    <p className="text-muted-foreground">
                      This team member hasn't been assigned to any sprints yet.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sprint Details Table */}
            {sprintData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sprint Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Sprint</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-center p-2">Sprint Score</th>
                          <th className="text-center p-2">Overall Score</th>
                          <th className="text-center p-2">Difference</th>
                          <th className="text-left p-2">Period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sprintData.map((sprint) => (
                          <tr
                            key={sprint.sprint_id}
                            className="border-b hover:bg-muted/50"
                          >
                            <td className="p-2 font-medium">
                              {sprint.sprint_name}
                            </td>
                            <td className="p-2">
                              <Badge
                                variant={
                                  sprint.status === "active"
                                    ? "default"
                                    : sprint.status === "completed"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {sprint.status}
                              </Badge>
                            </td>
                            <td className="p-2 text-center font-bold text-blue-600">
                              {sprint.sprint_score !== null
                                ? sprint.sprint_score
                                : "N/A"}
                            </td>
                            <td className="p-2 text-center font-bold text-green-600">
                              {sprint.overall_score}
                            </td>
                            <td className="p-2 text-center">
                              {sprint.sprint_score !== null ? (
                                <span
                                  className={
                                    sprint.sprint_score - sprint.overall_score >
                                    0
                                      ? "text-green-600 font-semibold"
                                      : sprint.sprint_score -
                                          sprint.overall_score <
                                        0
                                      ? "text-red-600 font-semibold"
                                      : "text-gray-600"
                                  }
                                >
                                  {sprint.sprint_score - sprint.overall_score >
                                  0
                                    ? "+"
                                    : ""}
                                  {sprint.sprint_score - sprint.overall_score}
                                </span>
                              ) : (
                                <span className="text-gray-400">N/A</span>
                              )}
                            </td>
                            <td className="p-2 text-sm text-muted-foreground">
                              {new Date(sprint.start_date).toLocaleDateString()}{" "}
                              - {new Date(sprint.end_date).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
