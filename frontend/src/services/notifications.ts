/**
 * API service for notifications
 */
import API from "@/lib/axios/instance";

export interface Notification {
  id: number;
  recipient_id: number;
  sender_id?: number;
  type: string;
  title: string;
  message: string;
  data?: any;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

class NotificationService {
  /**
   * Get user's notifications with pagination
   */
  async getUserNotifications(params?: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
  }): Promise<{
    notifications: Notification[];
    total: number;
    unread_count: number;
  }> {
    const queryParams = new URLSearchParams();

    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.offset) queryParams.append("offset", params.offset.toString());
    if (params?.unread_only) queryParams.append("unread_only", "true");

    const response = await API.get(`/notifications/user?${queryParams}`);

    console.log("Fetched notifications:", response.data); // Debug log

    return response.data;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number): Promise<void> {
    await API.patch(`/notifications/${notificationId}/read`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await API.patch("/notifications/read-all");
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: number): Promise<void> {
    await API.delete(`/notifications/${notificationId}`);
  }

  /**
   * Get notification by ID
   */
  async getNotification(notificationId: number): Promise<Notification> {
    const response = await API.get(`/notifications/${notificationId}`);
    return response.data;
  }
}

export const notificationService = new NotificationService();
