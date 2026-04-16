/**
 * Notification context for managing real-time notifications
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { webSocketService } from "@/services/websocket";
import type { NotificationMessage } from "@/services/websocket";
import { notificationService } from "@/services/notifications";
import type { Notification } from "@/services/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: number) => Promise<void>;
  // refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Get token from localStorage
  const getToken = () => localStorage.getItem("token");

  // Load initial notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const response = await notificationService.getUserNotifications({
        limit: 50,
        offset: 0,
      });
      setNotifications(response.notifications || []);
      setUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error("Failed to load notifications:", error);
      // Ensure we have a fallback array on error
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  // Refresh notifications from server
  // const refreshNotifications = useCallback(async () => {
  //   await loadNotifications();
  // }, [loadNotifications]);

  // Handle incoming WebSocket notification
  const handleWebSocketNotification = useCallback(
    (notification: NotificationMessage) => {
      // Convert the WebSocket notification to frontend Notification format
      const newNotification: Notification = {
        id: notification.id,
        recipient_id: notification.recipient_id,
        sender_id: notification.sender_id || 0,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        is_read: notification.is_read,
        created_at: notification.created_at,
        read_at: notification.read_at,
      };

      // Show toast notification with proper navigation
      toast.info(notification.title, {
        description: notification.message,
        action:
          notification.data && notification.type !== "team_joining_request"
            ? {
                label: "View",
                onClick: () => {
                  // Mark as read if unread
                  if (!newNotification.is_read) {
                    markAsRead(newNotification.id);
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
                  } else if (
                    notification.type === "team_request_accepted" ||
                    notification.type === "team_request_rejected"
                  ) {
                    navigate(`/dashboard/${user?.role}/team-overview`);
                  }
                },
              }
            : undefined,
      });

      // Add to the beginning of the notifications array (true real-time)
      setNotifications((prev) => [newNotification, ...prev.slice(0, 49)]); // Keep only latest 50

      // Only increment unread count if the notification is unread
      if (!notification.is_read) {
        setUnreadCount((prev) => prev + 1);
      }
    },
    [navigate, user?.role]
  );

  // Handle connection state changes
  const handleConnectionStateChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    if (connected) {
      console.log("WebSocket connected - notifications enabled");
    } else {
      console.log("WebSocket disconnected - notifications disabled");
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      await notificationService.markAsRead(notificationId);

      // Update local state
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                is_read: true,
                read_at: new Date().toISOString(),
              }
            : notification
        )
      );

      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      toast.error("Failed to mark notification as read");
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();

      // Update local state
      setNotifications((prev) =>
        prev.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: new Date().toISOString(),
        }))
      );

      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      toast.error("Failed to mark all notifications as read");
    }
  }, []);

  // Delete notification
  const deleteNotification = useCallback(
    async (notificationId: number) => {
      try {
        await notificationService.deleteNotification(notificationId);

        // Update local state
        const notification = notifications.find((n) => n.id === notificationId);
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));

        if (notification && !notification.is_read) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }

        // toast.success("Notification deleted");
      } catch (error) {
        console.error("Failed to delete notification:", error);
        toast.error("Failed to delete notification");
      }
    },
    [notifications]
  );

  // Setup WebSocket connection when user logs in
  useEffect(() => {
    const token = getToken();
    if (user && token) {
      // Connect to WebSocket
      webSocketService.connect(token);

      // Add listeners
      webSocketService.addNotificationListener(handleWebSocketNotification);
      webSocketService.addConnectionStateListener(handleConnectionStateChange);

      // Load initial notifications
      loadNotifications();

      return () => {
        // Cleanup listeners
        webSocketService.removeNotificationListener(
          handleWebSocketNotification
        );
        webSocketService.removeConnectionStateListener(
          handleConnectionStateChange
        );
      };
    } else {
      // Disconnect WebSocket when user logs out
      webSocketService.disconnect();
      setNotifications([]);
      setUnreadCount(0);
      setIsConnected(false);
    }
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webSocketService.disconnect();
    };
  }, []);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    // refreshNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
};
