import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SprintWithStats } from "@/types/sprint";

interface ProductivityScoreChartProps {
  sprints: SprintWithStats[];
  currentUserId?: number;
}

interface TooltipPayload {
  value: number;
  payload: {
    sprintName: string;
    sprintId: number;
    startDate: string;
    status: string;
  };
}

export default function ProductivityScoreChart({
  sprints,
  currentUserId,
}: ProductivityScoreChartProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Transform sprint data to chart format
  const chartData = sprints
    .filter(
      (sprint) =>
        sprint.status === "completed" ||
        sprint.status === "active" ||
        sprint.status === "planning" ||
        sprint.status === "on_hold"
    )
    .sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )
    .map((sprint) => {
      // Find current user's productivity scores in this sprint
      const currentMember = sprint.sprint_members?.find(
        (member) => member.team_member_id === currentUserId
      );

      return {
        name: sprint.name,
        sprintName: sprint.name,
        sprintId: sprint.id,
        startDate: sprint.start_date,
        teamProductivity: currentMember?.team_member_productivity_score ?? 0,
        sprintProductivity: currentMember?.sprint_productivity_score ?? 0,
        status: sprint.status,
      };
    });

  // Handle chart click to navigate to sprint dashboard
  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0] && user?.role) {
      const sprintId = data.activePayload[0].payload.sprintId;
      if (sprintId) {
        navigate(`/dashboard/${user.role}/sprints/${sprintId}`);
      }
    }
  };

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: TooltipPayload[];
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-foreground mb-2">
            {payload[0].payload.sprintName}
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            Started:{" "}
            {new Date(payload[0].payload.startDate).toLocaleDateString()}
          </p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-blue-500">●</span> Overall Score:{" "}
              <span className="font-medium">{payload[0].value}</span>
            </p>
            <p className="text-sm">
              <span className="text-green-500">●</span> Sprint Score:{" "}
              <span className="font-medium">{payload[1].value}</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2 capitalize">
            Status: {payload[0].payload.status}
          </p>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Productivity Trend</CardTitle>
          <CardDescription>
            Track your performance across sprints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No productivity data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productivity Trend</CardTitle>
        <CardDescription>
          Track your performance across {chartData.length} sprint
          {chartData.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            onClick={handleChartClick}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="name"
              className="text-xs"
              tick={{ fill: "currentColor" }}
              tickLine={{ stroke: "currentColor" }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: "currentColor" }}
              tickLine={{ stroke: "currentColor" }}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => {
                if (value === "teamProductivity")
                  return "Overall Productivity Score";
                if (value === "sprintProductivity")
                  return "Sprint-Specific Score";
                return value;
              }}
            />
            <Line
              type="monotone"
              dataKey="teamProductivity"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--chart-1))", r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="sprintProductivity"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--chart-2))", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
