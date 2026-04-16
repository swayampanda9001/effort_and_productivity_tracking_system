import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import API from "@/lib/axios/instance";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Clock,
  X,
  CheckCircle,
  Bell,
  MessageSquare,
  Calendar,
  User,
} from "lucide-react";

interface Alert {
  id: number;
  manager_id?: number;
  user_id: number;
  task_id?: number;
  alert_type: string;
  alert_message: string;
  is_read: boolean;
  is_dismissed: boolean;
  priority: string;
  created_at: string;
  updated_at: string;
}

export default function AlertsComponent() {
  const queryClient = useQueryClient();

  // Fetch user alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const response = await API.get("/alerts/");
      return response.data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Mark alert as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await API.put(`/alerts/${alertId}/read`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert marked as read");
    },
    onError: (error: any) => {
      console.error("Error marking alert as read:", error);
      toast.error("Failed to mark alert as read");
    },
  });

  // Dismiss alert mutation
  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const response = await API.delete(`/alerts/${alertId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert dismissed");
    },
    onError: (error: any) => {
      console.error("Error dismissing alert:", error);
      toast.error("Failed to dismiss alert");
    },
  });

  const handleMarkAsRead = (alertId: number) => {
    markAsReadMutation.mutate(alertId);
  };

  const handleDismissAlert = (alertId: number) => {
    dismissAlertMutation.mutate(alertId);
  };

  const getAlertIcon = (alertType: string) => {
    switch (alertType) {
      case "task_due":
        return <Clock className="h-4 w-4" />;
      case "task_overdue":
        return <AlertTriangle className="h-4 w-4" />;
      case "comment_reply":
        return <MessageSquare className="h-4 w-4" />;
      case "mention":
        return <User className="h-4 w-4" />;
      case "sprint_update":
        return <Calendar className="h-4 w-4" />;
      case "assignment":
        return <User className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "destructive";
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading alerts...</div>
        </CardContent>
      </Card>
    );
  }

  const unreadAlerts = alerts.filter((alert: Alert) => !alert.is_read);
  const readAlerts = alerts.filter((alert: Alert) => alert.is_read);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
          {unreadAlerts.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unreadAlerts.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Stay updated with important messages and task reminders
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>No notifications yet</p>
              <p className="text-sm">You'll see important updates here</p>
            </div>
          ) : (
            <>
              {/* Unread Alerts */}
              {unreadAlerts.length > 0 && (
                <div className="">
                  <h4 className="font-medium text-sm text-foreground mb-3">
                    New ({unreadAlerts.length})
                  </h4>
                  <div className="space-y-3">
                    {unreadAlerts.map((alert: Alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start gap-3 py-4 px-3 bg-muted/50 rounded-lg border-l-4 border-l-primary"
                      >
                        <div className="flex-shrink-0 mt-0.5 text-primary">
                          {getAlertIcon(alert.alert_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {alert.alert_message}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={getPriorityColor(alert.priority)} className="text-xs">
                                  {alert.priority.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatTimeAgo(alert.created_at)}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkAsRead(alert.id)}
                                disabled={markAsReadMutation.isPending}
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDismissAlert(alert.id)}
                                disabled={dismissAlertMutation.isPending}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Read Alerts */}
              {readAlerts.length > 0 && (
                <div className="">
                  {unreadAlerts.length > 0 && <hr className="my-4" />}
                  <h4 className="font-medium text-sm text-muted-foreground mb-3">
                    Earlier
                  </h4>
                  <div className="space-y-3">
                    {readAlerts.slice(0, 5).map((alert: Alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start gap-3 py-4 px-3 rounded-lg opacity-75"
                      >
                        <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
                          {getAlertIcon(alert.alert_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm text-muted-foreground">
                                {alert.alert_message}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {alert.priority.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatTimeAgo(alert.created_at)}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDismissAlert(alert.id)}
                              disabled={dismissAlertMutation.isPending}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
