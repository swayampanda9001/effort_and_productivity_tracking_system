/**
 * Notification Bell component for the navigation
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Bell,
  Check,
  Trash2,
  X,
  User,
  MessageSquare,
  ClipboardList,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/contexts/NotificationContext";
import type { Notification } from "@/services/notifications";
import API from "@/lib/axios/instance";
import { toast } from "sonner";

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [processingRequests, setProcessingRequests] = useState<Set<number>>(
    new Set()
  );

  const handleAcceptRequest = async (
    notification: Notification,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();

    if (!notification.data?.request_id) {
      toast.error("Invalid request data");
      return;
    }

    setProcessingRequests((prev) => new Set(prev).add(notification.id));

    try {
      const response = await API.post(
        `/team-members/joining-requests/${notification.data.request_id}/accept`
      );

      toast.success(
        `Successfully joined ${response.data.manager_name}'s team!`
      );

      // Mark notification as read and delete it since it's been processed
      await markAsRead(notification.id);
      await deleteNotification(notification.id);
    } catch (error: any) {
      console.error("Error accepting request:", error);
      toast.error(error.response?.data?.detail || "Failed to accept request");
    } finally {
      setProcessingRequests((prev) => {
        const newSet = new Set(prev);
        newSet.delete(notification.id);
        return newSet;
      });
    }
  };

  const handleRejectRequest = async (
    notification: Notification,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();

    if (!notification.data?.request_id) {
      toast.error("Invalid request data");
      return;
    }

    setProcessingRequests((prev) => new Set(prev).add(notification.id));

    try {
      const response = await API.post(
        `/team-members/joining-requests/${notification.data.request_id}/reject`
      );

      toast.success(
        `Request from ${response.data.manager_name} has been rejected`
      );

      // Mark notification as read and delete it since it's been processed
      await markAsRead(notification.id);
      await deleteNotification(notification.id);
    } catch (error: any) {
      console.error("Error rejecting request:", error);
      toast.error(error.response?.data?.detail || "Failed to reject request");
    } finally {
      setProcessingRequests((prev) => {
        const newSet = new Set(prev);
        newSet.delete(notification.id);
        return newSet;
      });
    }
  };

  const handleMarkAsRead = async (
    notificationId: number,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    await markAsRead(notificationId);
  };

  const handleDelete = async (
    notificationId: number,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    await deleteNotification(notificationId);
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navigate based on notification type and available data
    if (notification.type === "task_assigned") {
      navigate(
        `/dashboard/${user?.role}/sprints/${notification.data?.sprint_id}/task/${notification.data?.task_id}`
      );
    } else if (notification.type === "task_comment") {
      navigate(
        `/dashboard/${user?.role}/sprints/${notification.data?.sprint_id}/task/${notification.data?.task_id}?tab=comments`
      );
    }

    setIsOpen(false);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60)
    );

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = "h-4 w-4 flex-shrink-0";

    switch (type.toLowerCase()) {
      case "task_assigned":
      case "task_assignment":
        return <ClipboardList className={`${iconClass} text-primary`} />;
      case "task_comment":
      case "comment":
        return <MessageSquare className={`${iconClass} text-blue-500`} />;
      case "task_completed":
      case "completed":
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case "task_due":
      case "due_date":
        return <Clock className={`${iconClass} text-orange-500`} />;
      case "sprint_started":
      case "sprint_ended":
        return <Calendar className={`${iconClass} text-purple-500`} />;
      case "team_joining_request":
      case "team_request_accepted":
      case "team_request_rejected":
      case "team_member_added":
      case "user_added":
        return <UserPlus className={`${iconClass} text-indigo-500`} />;
      case "alert":
      case "warning":
        return <AlertTriangle className={`${iconClass} text-yellow-500`} />;
      case "user":
      case "profile":
        return <User className={`${iconClass} text-gray-500`} />;
      default:
        return <Bell className={`${iconClass} text-muted-foreground`} />;
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
          {!isConnected && (
            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="p-4 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs h-6 px-2 text-primary hover:text-primary/80"
              >
                Mark all read
              </Button>
            )}
          </div>
          {!isConnected && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              Real-time notifications disabled
            </p>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No notifications yet
              </p>
            </div>
          ) : (
            notifications.slice(0, 20).map((notification: Notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors ${
                  !notification.is_read
                    ? "bg-primary/5 border-l-4 border-l-primary"
                    : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium truncate text-foreground">
                        {notification.title}
                      </h4>
                      {!notification.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {notification.message}
                    </p>
                    {notification.type === "team_joining_request" && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={processingRequests.has(notification.id)}
                          onClick={(e: React.MouseEvent) =>
                            handleAcceptRequest(notification, e)
                          }
                          className="flex-1"
                        >
                          {processingRequests.has(notification.id)
                            ? "Accepting..."
                            : "Accept"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={processingRequests.has(notification.id)}
                          onClick={(e: React.MouseEvent) =>
                            handleRejectRequest(notification, e)
                          }
                          className="flex-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          {processingRequests.has(notification.id)
                            ? "Rejecting..."
                            : "Reject"}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatTimeAgo(notification.created_at)}
                    </p>
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    {!notification.is_read &&
                      notification.type !== "team_joining_request" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e: React.MouseEvent) =>
                            handleMarkAsRead(notification.id, e)
                          }
                          className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent) =>
                        handleDelete(notification.id, e)
                      }
                      className={`h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive ${
                        notification.type === "team_joining_request" && "hidden"
                      }`}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {notifications && notifications.length > 20 && (
          <div className="p-3 border-t border-border text-center bg-card">
            <Button
              variant="link"
              size="sm"
              className="text-xs text-primary hover:text-primary/80"
            >
              View all notifications
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
