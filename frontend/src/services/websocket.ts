/**
 * WebSocket service for real-time notifications
 */

export interface NotificationMessage {
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

export interface WebSocketMessage {
  type: string;
  notification: NotificationMessage;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectInterval = 1000;
  private listeners: Set<(notification: NotificationMessage) => void> =
    new Set();
  private connectionStateListeners: Set<(connected: boolean) => void> =
    new Set();
  private isConnected = false;

  constructor() {
    // Empty constructor
  }

  /**
   * Connect to WebSocket with authentication token
   */
  connect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Construct WebSocket URL with token as query parameter
      const apiUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:8000";

      // Convert HTTP/HTTPS to WS/WSS properly
      let wsBaseUrl;
      if (apiUrl.startsWith("https://")) {
        wsBaseUrl = apiUrl.replace("https://", "wss://");
      } else if (apiUrl.startsWith("http://")) {
        wsBaseUrl = apiUrl.replace("http://", "ws://");
      } else if (apiUrl.startsWith("wss://") || apiUrl.startsWith("ws://")) {
        wsBaseUrl = apiUrl; // Already a WebSocket URL
      } else {
        // Assume http if no protocol specified
        wsBaseUrl = "ws://" + apiUrl;
      }

      const wsUrl =
        wsBaseUrl +
        "/api/v1/ws/notifications?token=" +
        encodeURIComponent(token);
      console.log("Connecting to WebSocket:", wsUrl); // Debug log
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected successfully");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionState(true);
      };

      this.ws.onmessage = (event) => {
        try {
          console.log("WebSocket message received:", event.data);
          const wsMessage: WebSocketMessage = JSON.parse(event.data);

          if (wsMessage.type === "notification" && wsMessage.notification) {
            this.handleNotification(wsMessage.notification);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        this.isConnected = false;
        this.notifyConnectionState(false);

        // Attempt to reconnect if it wasn't a deliberate close
        if (
          event.code !== 1000 &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          setTimeout(() => {
            this.reconnectAttempts++;
            console.log(
              `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );
            this.connect(token);
          }, this.reconnectInterval * Math.pow(2, this.reconnectAttempts));
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
      this.isConnected = false;
      this.notifyConnectionState(false);
    }
  }

  /**
   * Update authentication token
   */
  updateToken(token: string): void {
    // Reconnect with new token if currently connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
      setTimeout(() => this.connect(token), 100);
    }
  }

  /**
   * Add listener for incoming notifications
   */
  addNotificationListener(
    listener: (notification: NotificationMessage) => void
  ): void {
    this.listeners.add(listener);
  }

  /**
   * Remove notification listener
   */
  removeNotificationListener(
    listener: (notification: NotificationMessage) => void
  ): void {
    this.listeners.delete(listener);
  }

  /**
   * Add listener for connection state changes
   */
  addConnectionStateListener(listener: (connected: boolean) => void): void {
    this.connectionStateListeners.add(listener);
  }

  /**
   * Remove connection state listener
   */
  removeConnectionStateListener(listener: (connected: boolean) => void): void {
    this.connectionStateListeners.delete(listener);
  }

  /**
   * Get current connection state
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Handle incoming notification
   */
  private handleNotification(notification: NotificationMessage): void {
    // Notify all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (error) {
        console.error("Error in notification listener:", error);
      }
    });
  }

  /**
   * Notify connection state listeners
   */
  private notifyConnectionState(connected: boolean): void {
    this.connectionStateListeners.forEach((listener) => {
      try {
        listener(connected);
      } catch (error) {
        console.error("Error in connection state listener:", error);
      }
    });
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();
