import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { AuthUser } from "@/types/auth";
import API from "@/lib/axios/instance";
import { webSocketService } from "@/services/websocket";

interface AuthContextType {
  user: AuthUser | null;
  login: (userData: AuthUser, token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const login = (userData: AuthUser, token: string) => {
    localStorage.setItem("token", token);
    setUser(userData);

    // Update WebSocket service with new token and connect
    webSocketService.updateToken(token);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);

    // Disconnect WebSocket
    webSocketService.disconnect();

    window.location.href = "/auth/login"; // Redirect to login page
  };

  const refreshUser = async (): Promise<void> => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const response = await API.get("/auth/me");
        setUser(response.data);
      } catch (error) {
        console.error("Error refreshing user:", error);
        // If token is invalid/expired, remove it and logout
        localStorage.removeItem("token");
        setUser(null);
      }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      API.get("/auth/me")
        .then((response) => {
          console.log("User data fetched successfully:", response.data);
          setUser(response.data); // Changed from response.data.user to response.data

          // Initialize WebSocket connection for authenticated user
          webSocketService.updateToken(token);
        })
        .catch((error) => {
          console.error("Error fetching user:", error);
          // If token is invalid/expired, remove it and logout
          localStorage.removeItem("token");
          setUser(null);
          webSocketService.disconnect();
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // No token, set loading to false immediately
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, logout, refreshUser, isLoading, setIsLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
