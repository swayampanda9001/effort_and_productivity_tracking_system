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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SprintWithStats } from "@/types/sprint";

interface ProductivityScoreBarChartProps {
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

export default function ProductivityScoreBarChart({
  sprints,
  currentUserId,
}: ProductivityScoreBarChartProps) {
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
    .slice(-6) // Show only last 6 sprints for better readability
    .map((sprint) => {
      // Find current user's productivity scores in this sprint
      const currentMember = sprint.sprint_members?.find(
        (member) => member.team_member_id === currentUserId
      );

      return {
        name:
          sprint.name.length > 15
            ? sprint.name.substring(0, 15) + "..."
            : sprint.name,
        sprintName: sprint.name,
        sprintId: sprint.id,
        startDate: sprint.start_date,
        "Overall Score": currentMember?.team_member_productivity_score ?? 0,
        "Sprint Score": currentMember?.sprint_productivity_score ?? 0,
        status: sprint.status,
      };
    });

  // Handle bar click to navigate to sprint dashboard
  const handleBarClick = (data: any) => {
    if (data && data.sprintId && user?.role) {
      navigate(`/dashboard/${user.role}/sprints/${data.sprintId}`);
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
            {payload.map((entry, index) => (
              <p key={index} className="text-sm">
                <span
                  style={{
                    color: "hsl(25 95% 53%)",
                  }}
                >
                  ●
                </span>{" "}
                {"Sprint Score : "}
                <span className="font-medium">{entry.value}</span>
              </p>
            ))}
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
          <CardTitle>Sprint Performance Comparison</CardTitle>
          <CardDescription>
            Compare your scores across recent sprints
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
        <CardTitle>Sprint Performance Comparison</CardTitle>
        <CardDescription>
          Compare your scores across the last {chartData.length} sprint
          {chartData.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="name"
              className="text-xs"
              tick={{ fill: "currentColor" }}
              tickLine={{ stroke: "currentColor" }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: "currentColor" }}
              tickLine={{ stroke: "currentColor" }}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "10px" }}
              formatter={(value) => value}
            />
            {/* <Bar
              dataKey="Overall Score"
              fill="hsl(var(--chart-1))"
              radius={[4, 4, 0, 0]}
            /> */}
            <Bar
              dataKey="Sprint Score"
              fill="hsl(25 95% 53% / 0.4)"
              radius={[4, 4, 0, 0]}
              onClick={handleBarClick}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
