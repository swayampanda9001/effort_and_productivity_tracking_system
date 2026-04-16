import type React from "react";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import API from "@/lib/axios/instance";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  Calendar,
  Briefcase,
  Target,
  Eye,
  EyeOff,
  Camera,
  Save,
  Edit,
  CheckCircle,
  AlertCircle,
  User,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";

// Mock user data based on ORIGINAL database schema
const mockUser = {
  // From users table
  id: 1,
  username: "john.doe",
  email: "john.doe@example.com",
  full_name: "John Doe",
  role: "team_member" as const,
  avatar_url: "/placeholder.svg",
  is_active: true,
  last_login: "2024-01-15T10:30:00Z",
  created_at: "2022-03-15T09:00:00Z",

  // From team_members table (original schema)
  employee_id: "EMP001",
  department: "Engineering",
  position: "Senior Full Stack Developer",
  manager_id: 6,
  manager_name: "Sarah Johnson",
  hire_date: "2022-03-15",
  skills: ["React", "Node.js", "TypeScript", "Python", "AWS", "Docker"], // JSON field
  productivity_score: 92,
  total_logged_hours: 340.5,
  total_completed_tasks: 42,
};

const allowedFileTypes: string[] = [
  "image/png",
  "image/jpg",
  "image/jpeg",
  "image/webp",
  "image/svg",
];

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [profileData, setProfileData] = useState(mockUser);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [emailChangeData, setEmailChangeData] = useState({
    newEmail: "",
    password: "",
    otp: "",
    step: "request" as "request" | "verify",
    isLoading: false,
    otpSentTime: null as Date | null,
  });
  const [usernameChangeData, setUsernameChangeData] = useState({
    newUsername: "",
    isLoading: false,
  });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [avatarUpload, setAvatarUpload] = useState({
    isDialogOpen: false,
    selectedFile: null as File | null,
    previewUrl: null as string | null,
    isUploading: false,
  });

  // Helper function to format role display
  const formatRoleDisplay = (role: string) => {
    switch (role) {
      case "pm":
        return "Project Manager";
      case "sm":
        return "Scrum Master";
      case "team_member":
        return "Team Member";
      case "admin":
        return "Administrator";
      default:
        return role.replace("_", " ").toUpperCase();
    }
  };

  // Helper function to check role-based permissions
  const canEditRole = () => {
    return (user?.role as string) === "admin";
  };

  const canEditAdvancedSettings = () => {
    const userRole = user?.role as string;
    return userRole === "admin" || userRole === "pm";
  };

  const isTeamMember = () => {
    return profileData.role === "team_member";
  };

  const isPMOrAdmin = () => {
    const userRole = user?.role as string;
    return userRole === "pm" || userRole === "admin";
  };

  // Fetch user data
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
  } = useQuery({
    queryKey: ["user", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const response = await API.get(`/users/${user.id}`);
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Fetch team member data (only for team members)
  const {
    data: teamMemberData,
    isLoading: teamMemberLoading,
    error: teamMemberError,
  } = useQuery({
    queryKey: ["team-member", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const response = await API.get(`/users/${user.id}/team-member`);
        return response.data;
      } catch (error: any) {
        // If user is not a team member (e.g., PM, admin), the endpoint might return 404
        // This is expected behavior for non-team member roles
        if (error?.response?.status === 404) {
          console.log("No team member data found - user might be PM/admin");
          return null;
        }
        throw error;
      }
    },
    enabled: !!user?.id,
    retry: (failureCount, error: any) => {
      // Don't retry if it's a 404 (user is not a team member)
      if (error?.response?.status === 404) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Sync profile data with fetched data
  useEffect(() => {
    if (userData) {
      console.log("User Data:", userData);
      console.log("Team Member Data:", teamMemberData);
      console.log("User Role:", userData.role);

      // For team members, wait for team member data
      if (userData.role === "team_member" && !teamMemberData) {
        console.log("Waiting for team member data...");
        return;
      }

      // For non-team members or when we have team member data
      const baseProfileData = {
        // User data (always available)
        id: userData.id,
        username: userData.username,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        avatar_url: userData.avatar_url,
        is_active: userData.is_active,
        last_login: userData.last_login,
        created_at: userData.created_at,
      };

      // Team member data (only for team members)
      if (teamMemberData) {
        console.log("Manager ID:", teamMemberData.manager_id);
        console.log("Manager Name:", teamMemberData.manager_name);
        setProfileData({
          ...baseProfileData,
          employee_id: teamMemberData.employee_id,
          department: teamMemberData.department,
          position: teamMemberData.position,
          manager_id: teamMemberData.manager_id,
          manager_name: teamMemberData.manager_name,
          hire_date: teamMemberData.hire_date,
          skills: teamMemberData.skills || [],
          productivity_score: teamMemberData.productivity_score || 0,
          total_logged_hours: teamMemberData.total_logged_hours || 0,
          total_completed_tasks: teamMemberData.total_completed_tasks || 0,
        });
      } else {
        // For managers/admins without team member data
        setProfileData({
          ...baseProfileData,
          employee_id: "",
          department: "",
          position: "",
          manager_id: 0,
          manager_name: "",
          hire_date: "",
          skills: [],
          productivity_score: 0,
          total_logged_hours: 0,
          total_completed_tasks: 0,
        });
      }
    }
  }, [userData, teamMemberData]);

  const profileMutation = useMutation({
    mutationFn: async (profileData: any) => {
      // Update user data (users table) - excluding email
      const userUpdate = {
        username: profileData.username,
        full_name: profileData.full_name,
        role: profileData.role,
      };

      // Update team member data (team_members table)
      const teamMemberUpdate = {
        employee_id: profileData.employee_id,
        department: profileData.department,
        position: profileData.position,
        hire_date: profileData.hire_date,
        skills: profileData.skills,
      };

      // Make both API calls
      const [userResponse, teamMemberResponse] = await Promise.all([
        API.put(`/users/${user?.id}`, userUpdate),
        API.put(`/users/${user?.id}/team-member`, teamMemberUpdate),
      ]);

      return {
        user: userResponse.data,
        teamMember: teamMemberResponse.data,
      };
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setIsEditing(false);
      toast.success("Profile updated successfully!");
      // Invalidate and refetch user and team member data
      queryClient.invalidateQueries({ queryKey: ["user", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["team-member", user?.id] });
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: (error: any) => {
      setSaveStatus("error");
      if (error?.response?.status === 403) {
        toast.error("You don't have permission to update this profile");
      } else if (error?.response?.status === 422) {
        toast.error("Invalid data format. Please check your inputs.");
      } else {
        toast.error("Failed to update profile. Please try again.");
      }
    },
  });

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!profileData.username.trim()) {
      toast.error("Username is required");
      return;
    }

    if (!profileData.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (profileData.username.length < 3) {
      toast.error("Username must be at least 3 characters long");
      return;
    }

    setSaveStatus("saving");
    profileMutation.mutate(profileData);
  };

  const passwordMutation = useMutation({
    mutationFn: async (password_data: {
      current_password: string;
      new_password: string;
    }) => {
      const response = await API.patch(`/users/change-password`, password_data);
      return response.data;
    },
    onSuccess: () => {
      setSaveStatus("saved");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Password updated successfully!");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: (error: any) => {
      setSaveStatus("error");
      if (error?.response?.status === 404) {
        toast.error("Current password is incorrect");
      } else if (error?.response?.status === 422) {
        toast.error(
          "Invalid password format. Password must be at least 8 characters long."
        );
      } else {
        toast.error("Failed to update password. Please try again.");
      }
    },
  });

  // Email change mutations
  const requestEmailChangeMutation = useMutation({
    mutationFn: async (data: { new_email: string; password: string }) => {
      const response = await API.post("/users/request-email-change", data);
      return response.data;
    },
    onSuccess: () => {
      setEmailChangeData((prev) => ({
        ...prev,
        step: "verify",
        otpSentTime: new Date(),
        isLoading: false,
      }));
      toast.success("OTP sent to your new email address");
    },
    onError: (error: any) => {
      setEmailChangeData((prev) => ({ ...prev, isLoading: false }));
      if (error?.response?.status === 400) {
        const detail = error?.response?.data?.detail;
        if (detail?.includes("password")) {
          toast.error("Current password is incorrect");
        } else if (detail?.includes("already in use")) {
          toast.error("Email address is already in use");
        } else {
          toast.error(detail || "Invalid request");
        }
      } else if (error?.response?.status === 409) {
        toast.error("Email address is already in use");
      } else if (error?.response?.status === 422) {
        toast.error("Invalid email format");
      } else {
        toast.error("Failed to send OTP. Please try again.");
      }
    },
  });

  const verifyEmailChangeMutation = useMutation({
    mutationFn: async (data: { new_email: string; otp: string }) => {
      const response = await API.post("/users/verify-email-change", data);
      return response.data;
    },
    onSuccess: (data) => {
      setEmailChangeData({
        newEmail: "",
        password: "",
        otp: "",
        step: "request",
        isLoading: false,
        otpSentTime: null,
      });
      setProfileData((prev) => ({ ...prev, email: data.email }));
      toast.success("Email address updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["user", user?.id] });
    },
    onError: (error: any) => {
      setEmailChangeData((prev) => ({ ...prev, isLoading: false }));
      if (error?.response?.status === 404) {
        toast.error("Invalid or expired OTP");
      } else if (error?.response?.status === 422) {
        toast.error("Invalid OTP format");
      } else {
        toast.error("Failed to verify OTP. Please try again.");
      }
    },
  });

  // Username change mutation
  const usernameChangeMutation = useMutation({
    mutationFn: async (data: { new_username: string }) => {
      const response = await API.post("/users/change-username", data);
      return response.data;
    },
    onSuccess: (data) => {
      setUsernameChangeData({
        newUsername: "",
        isLoading: false,
      });
      setProfileData((prev) => ({ ...prev, username: data.username }));
      toast.success("Username updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["user", user?.id] });
    },
    onError: (error: any) => {
      setUsernameChangeData((prev) => ({ ...prev, isLoading: false }));
      if (error?.response?.status === 400) {
        const detail = error?.response?.data?.detail;
        if (detail?.includes("already exists")) {
          toast.error("Username is already taken");
        } else {
          toast.error(detail || "Invalid request");
        }
      } else if (error?.response?.status === 409) {
        toast.error("Username is already taken");
      } else if (error?.response?.status === 422) {
        toast.error("Invalid username format");
      } else {
        toast.error("Failed to update username. Please try again.");
      }
    },
  });

  // Avatar upload mutation
  const avatarUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fileURL = await API.get(
        `/r2storage/generate-presigned-url?content_type=${file.type}`
      );
      if (fileURL.data.upload_url) {
        await axios.put(fileURL.data.upload_url, file, {
          headers: {
            "Content-Type": file.type,
          },
        });
      } else {
        throw new Error("Failed to get upload URL");
      }
      const response = await API.patch(`/users/update-avatar-url`, {
        avatar_url: fileURL.data.filename,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setProfileData((prev) => ({ ...prev, avatar_url: data.avatar_url }));
      setAvatarUpload({
        isDialogOpen: false,
        selectedFile: null,
        previewUrl: null,
        isUploading: false,
      });
      toast.success("Avatar updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["user", user?.id] });
    },
    onError: (error: any) => {
      setAvatarUpload((prev) => ({ ...prev, isUploading: false }));
      if (error?.response?.status === 413) {
        toast.error("File too large. Please select an image under 5MB.");
      } else if (error?.response?.status === 400) {
        toast.error(
          "Invalid file format. Please select a JPG, PNG, or GIF image."
        );
      } else {
        toast.error("Failed to upload avatar. Please try again.");
      }
    },
  });

  // Avatar upload handlers
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Please select an image under 5MB.");
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);

    setAvatarUpload({
      isDialogOpen: true,
      selectedFile: file,
      previewUrl,
      isUploading: false,
    });
  };

  const handleAvatarUpload = () => {
    if (!avatarUpload.selectedFile) return;
    if (!allowedFileTypes.includes(avatarUpload.selectedFile.type)) {
      toast.error("Invalid file type. Please select a valid image.");
      return;
    }

    setAvatarUpload((prev) => ({ ...prev, isUploading: true }));
    avatarUploadMutation.mutate(avatarUpload.selectedFile);
  };

  const handleAvatarCancel = () => {
    if (avatarUpload.previewUrl) {
      URL.revokeObjectURL(avatarUpload.previewUrl);
    }
    setAvatarUpload({
      isDialogOpen: false,
      selectedFile: null,
      previewUrl: null,
      isUploading: false,
    });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setSaveStatus("error");
      toast.error("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setSaveStatus("error");
      toast.error("New password must be at least 8 characters long");
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      setSaveStatus("error");
      toast.error("New password must be different from current password");
      return;
    }

    const password_data = {
      current_password: passwordData.currentPassword,
      new_password: passwordData.newPassword,
    };
    passwordMutation.mutate(password_data);
  };

  const handleEmailChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailChangeData.newEmail.trim()) {
      toast.error("Please enter a new email address");
      return;
    }

    if (!emailChangeData.password.trim()) {
      toast.error("Please enter your current password");
      return;
    }

    if (emailChangeData.newEmail === profileData.email) {
      toast.error("New email must be different from current email");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailChangeData.newEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setEmailChangeData((prev) => ({ ...prev, isLoading: true }));
    requestEmailChangeMutation.mutate({
      new_email: emailChangeData.newEmail,
      password: emailChangeData.password,
    });
  };

  const handleEmailChangeVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailChangeData.otp.trim()) {
      toast.error("Please enter the OTP");
      return;
    }

    if (emailChangeData.otp.length !== 6) {
      toast.error("OTP must be 6 digits");
      return;
    }

    setEmailChangeData((prev) => ({ ...prev, isLoading: true }));
    verifyEmailChangeMutation.mutate({
      new_email: emailChangeData.newEmail,
      otp: emailChangeData.otp,
    });
  };

  const handleResendOTP = () => {
    setEmailChangeData((prev) => ({ ...prev, isLoading: true, otp: "" }));
    requestEmailChangeMutation.mutate({
      new_email: emailChangeData.newEmail,
      password: emailChangeData.password,
    });
  };

  const getRemainingTime = () => {
    if (!emailChangeData.otpSentTime) return 0;
    const now = new Date();
    const diff =
      5 * 60 * 1000 - (now.getTime() - emailChangeData.otpSentTime.getTime()); // 5 minutes
    return Math.max(0, Math.floor(diff / 1000));
  };

  const handleUsernameChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!usernameChangeData.newUsername.trim()) {
      toast.error("Please enter a new username");
      return;
    }

    if (usernameChangeData.newUsername === profileData.username) {
      toast.error("New username must be different from current username");
      return;
    }

    if (usernameChangeData.newUsername.length < 3) {
      toast.error("Username must be at least 3 characters long");
      return;
    }

    if (usernameChangeData.newUsername.length > 50) {
      toast.error("Username must be less than 50 characters");
      return;
    }

    // Check for valid username format (alphanumeric and underscores)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(usernameChangeData.newUsername)) {
      toast.error(
        "Username can only contain letters, numbers, and underscores"
      );
      return;
    }

    setUsernameChangeData((prev) => ({ ...prev, isLoading: true }));
    usernameChangeMutation.mutate({
      new_username: usernameChangeData.newUsername,
    });
  };

  const handleSkillsUpdate = (newSkills: string[]) => {
    setProfileData({ ...profileData, skills: newSkills });

    // Auto-save skills immediately when updated
    const teamMemberUpdate = {
      skills: newSkills,
    };

    API.put(`/users/${user?.id}/team-member`, teamMemberUpdate)
      .then(() => {
        toast.success("Skills updated successfully!");
        // Invalidate and refetch team member data
        queryClient.invalidateQueries({ queryKey: ["team-member", user?.id] });
      })
      .catch((error) => {
        if (error?.response?.status === 403) {
          toast.error("You don't have permission to update skills");
        } else {
          toast.error("Failed to update skills. Please try again.");
        }
      });
  };

  // const getActivityIcon = (type: string) => {
  //   switch (type) {
  //     case "task_completed":
  //       return <CheckCircle className="h-4 w-4 text-green-500" />;
  //     case "effort_logged":
  //       return <Clock className="h-4 w-4 text-blue-500" />;
  //     case "comment_added":
  //       return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  //     default:
  //       return <AlertCircle className="h-4 w-4 text-gray-500" />;
  //   }
  // };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and view your performance
        </p>
      </div>

      {/* Loading state */}
      {(userLoading || teamMemberLoading) && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-muted-foreground">
            Loading profile data...
          </span>
        </div>
      )}

      {/* Error state */}
      {(userError ||
        (teamMemberError && teamMemberError?.response?.status !== 404)) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load profile data. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Profile content */}
      {!userLoading && !teamMemberLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Summary - from users + team_members tables */}
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader className="text-center">
                  <div className="relative mx-auto">
                    <Avatar className="h-24 w-24 mx-auto">
                      <AvatarImage
                        className="object-cover"
                        src={`${import.meta.env.VITE_R2_BASE_URL}${profileData.avatar_url}` || "/placeholder.svg"}
                      />
                      <AvatarFallback className="text-2xl">
                        {profileData.full_name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("") || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      size="icon"
                      variant="outline"
                      className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-transparent"
                      onClick={handleAvatarClick}
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardTitle className="mt-4">{user?.full_name}</CardTitle>
                  <CardDescription>{profileData.position}</CardDescription>
                  <Badge variant="outline" className="mt-2 w-fit mx-auto">
                    {formatRoleDisplay(profileData.role)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{user?.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {profileData.position || "Senior Full Stack Developer"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Hired{" "}
                      {new Date(profileData.hire_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {profileData.manager_name
                        ? `Reports to: ${profileData.manager_name}`
                        : profileData.role === "team_member"
                        ? "No manager assigned"
                        : "Management Role"}
                    </span>
                  </div>
                  {/* Role-specific information */}
                  {isPMOrAdmin() && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {(user?.role as string) === "admin"
                          ? "System Administrator"
                          : "Project Management Access"}
                      </span>
                    </div>
                  )}
                  {profileData.employee_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span>Employee ID: {profileData.employee_id}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Skills from team_members.skills JSON field */}
              <Card>
                <CardHeader>
                  <CardTitle>Skills & Expertise</CardTitle>
                  <CardDescription>
                    From team_members.skills JSON field
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {profileData.skills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                  {isEditing && (
                    <div className="mt-4">
                      <Label>Manage Skills (JSON Array)</Label>
                      <Input
                        placeholder="React, Node.js, TypeScript..."
                        className="mt-2"
                        defaultValue={profileData.skills.join(", ")}
                        onBlur={(e) => {
                          const newSkills = e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          handleSkillsUpdate(newSkills);
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Role-based Access & Privileges */}
              <Card>
                <CardHeader>
                  <CardTitle>Access & Privileges</CardTitle>
                  <CardDescription>
                    Your role-based permissions and capabilities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Current Role</span>
                      <Badge variant="default">
                        {formatRoleDisplay(profileData.role)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Profile Editing</span>
                      <Badge variant="secondary">Allowed</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Role Management</span>
                      <Badge variant={canEditRole() ? "secondary" : "outline"}>
                        {canEditRole() ? "Allowed" : "Restricted"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Advanced Settings</span>
                      <Badge
                        variant={
                          canEditAdvancedSettings() ? "secondary" : "outline"
                        }
                      >
                        {canEditAdvancedSettings() ? "Allowed" : "View Only"}
                      </Badge>
                    </div>
                    {isPMOrAdmin() && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Management Dashboard</span>
                        <Badge variant="secondary">Available</Badge>
                      </div>
                    )}
                    {(user?.role as string) === "admin" && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">System Administration</span>
                        <Badge variant="secondary">Full Access</Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Current Sprint Performance - from team_performance_view */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Personal Information</CardTitle>
                    <CardDescription>
                      Update data in your profile
                    </CardDescription>
                  </div>
                  <Button
                    variant={isEditing ? "outline" : "default"}
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Cancel
                      </>
                    ) : (
                      <>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Profile
                      </>
                    )}
                  </Button>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileUpdate} className="space-y-6">
                    {/* Team Members table fields - Show if user has team member data or can edit advanced settings */}
                    {(teamMemberData || canEditAdvancedSettings()) && (
                      <div className="space-y-4">
                        {/* <h4 className="font-medium text-sm text-muted-foreground">
                          {profileData.role === "team_member"
                            ? "Team Member Information"
                            : "Professional Information"}
                        </h4> */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="fullName">Full Name</Label>
                            <Input
                              id="fullName"
                              value={profileData.full_name}
                              onChange={(e) =>
                                setProfileData({
                                  ...profileData,
                                  full_name: e.target.value,
                                })
                              }
                              disabled={!isEditing}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="employeeId">Employee ID</Label>
                            <Input
                              id="employeeId"
                              value={profileData.employee_id}
                              onChange={(e) =>
                                setProfileData({
                                  ...profileData,
                                  employee_id: e.target.value,
                                })
                              }
                              disabled={
                                !isEditing ||
                                (!canEditAdvancedSettings() && !isTeamMember())
                              }
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="position">Position</Label>
                            <Input
                              id="position"
                              value={profileData.position}
                              onChange={(e) =>
                                setProfileData({
                                  ...profileData,
                                  position: e.target.value,
                                })
                              }
                              disabled={!isEditing}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="department">Department</Label>
                            <Input
                              id="department"
                              value={profileData.department}
                              onChange={(e) =>
                                setProfileData({
                                  ...profileData,
                                  department: e.target.value,
                                })
                              }
                              disabled={
                                !isEditing ||
                                (!canEditAdvancedSettings() && !isTeamMember())
                              }
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="manager">Manager</Label>
                            <Input
                              id="manager"
                              value={
                                profileData.manager_name ||
                                "No manager assigned"
                              }
                              disabled
                              className="bg-muted"
                            />
                            <p className="text-xs text-muted-foreground">
                              Manager assignment requires admin access
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="hireDate">Hire Date</Label>
                            <Input
                              id="hireDate"
                              type="date"
                              className="bg-slate-300 text-black"
                              value={profileData.hire_date}
                              onChange={(e) =>
                                setProfileData({
                                  ...profileData,
                                  hire_date: e.target.value,
                                })
                              }
                              disabled={!isEditing}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {isEditing && (
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={
                            saveStatus === "saving" || profileMutation.isPending
                          }
                        >
                          {saveStatus === "saving" || profileMutation.isPending
                            ? "Saving..."
                            : "Save Changes"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </form>

                  {saveStatus === "saved" && (
                    <Alert className="mt-4">
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Profile updated successfully!
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Change Email Address */}
              <Card>
                <CardHeader>
                  <CardTitle>Change Email Address</CardTitle>
                  <CardDescription>
                    Update your email address with OTP verification
                    {!isPMOrAdmin() && (
                      <span className="block mt-1 text-xs text-amber-600">
                        Note: Email changes may require manager approval in some
                        organizations
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {emailChangeData.step === "request" ? (
                    <form
                      onSubmit={handleEmailChangeRequest}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="currentEmail">Current Email</Label>
                        <Input
                          id="currentEmail"
                          type="email"
                          value={profileData.email}
                          disabled
                          className="bg-muted"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="newEmail">New Email Address</Label>
                        <Input
                          id="newEmail"
                          type="email"
                          value={emailChangeData.newEmail}
                          onChange={(e) =>
                            setEmailChangeData((prev) => ({
                              ...prev,
                              newEmail: e.target.value,
                            }))
                          }
                          placeholder="Enter your new email address"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="currentPasswordEmail">
                          Current Password
                        </Label>
                        <Input
                          id="currentPasswordEmail"
                          type="password"
                          value={emailChangeData.password}
                          onChange={(e) =>
                            setEmailChangeData((prev) => ({
                              ...prev,
                              password: e.target.value,
                            }))
                          }
                          placeholder="Enter your current password"
                          required
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={
                          emailChangeData.isLoading ||
                          requestEmailChangeMutation.isPending
                        }
                      >
                        {emailChangeData.isLoading ||
                        requestEmailChangeMutation.isPending
                          ? "Sending OTP..."
                          : "Send OTP"}
                      </Button>
                    </form>
                  ) : (
                    <form
                      onSubmit={handleEmailChangeVerify}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="newEmailDisplay">
                          New Email Address
                        </Label>
                        <Input
                          id="newEmailDisplay"
                          type="email"
                          value={emailChangeData.newEmail}
                          disabled
                          className="bg-muted"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="otp">Enter OTP</Label>
                        <Input
                          id="otp"
                          type="text"
                          maxLength={6}
                          value={emailChangeData.otp}
                          onChange={(e) =>
                            setEmailChangeData((prev) => ({
                              ...prev,
                              otp: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          placeholder="Enter 6-digit OTP"
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          OTP sent to {emailChangeData.newEmail}
                        </p>
                        {getRemainingTime() > 0 && (
                          <p className="text-xs text-orange-600">
                            OTP expires in {Math.floor(getRemainingTime() / 60)}
                            :
                            {(getRemainingTime() % 60)
                              .toString()
                              .padStart(2, "0")}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={
                            emailChangeData.isLoading ||
                            verifyEmailChangeMutation.isPending
                          }
                        >
                          {emailChangeData.isLoading ||
                          verifyEmailChangeMutation.isPending
                            ? "Verifying..."
                            : "Verify & Update Email"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setEmailChangeData({
                              newEmail: "",
                              password: "",
                              otp: "",
                              step: "request",
                              isLoading: false,
                              otpSentTime: null,
                            })
                          }
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleResendOTP}
                          disabled={
                            emailChangeData.isLoading ||
                            requestEmailChangeMutation.isPending
                          }
                        >
                          {emailChangeData.isLoading ||
                          requestEmailChangeMutation.isPending
                            ? "Sending..."
                            : "Resend OTP"}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>

              {/* Change Username */}
              <Card>
                <CardHeader>
                  <CardTitle>Change Username</CardTitle>
                  <CardDescription>
                    Update your username (no password required)
                    {!isPMOrAdmin() && (
                      <span className="block mt-1 text-xs text-amber-600">
                        Note: Username changes may be tracked for security
                        purposes
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUsernameChange} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentUsername">Current Username</Label>
                      <Input
                        id="currentUsername"
                        type="text"
                        value={profileData.username}
                        disabled
                        className="bg-muted"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="newUsername">New Username</Label>
                      <Input
                        id="newUsername"
                        type="text"
                        value={usernameChangeData.newUsername}
                        onChange={(e) =>
                          setUsernameChangeData((prev) => ({
                            ...prev,
                            newUsername: e.target.value,
                          }))
                        }
                        placeholder="Enter your new username"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Username must be 3-50 characters and contain only
                        letters, numbers, and underscores
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={
                        usernameChangeData.isLoading ||
                        usernameChangeMutation.isPending
                      }
                    >
                      {usernameChangeData.isLoading ||
                      usernameChangeMutation.isPending
                        ? "Updating Username..."
                        : "Update Username"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Change Password */}
              <Card>
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>
                    Update your password for security
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showPassword ? "text" : "password"}
                          value={passwordData.currentPassword}
                          onChange={(e) =>
                            setPasswordData({
                              ...passwordData,
                              currentPassword: e.target.value,
                            })
                          }
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            newPassword: e.target.value,
                          })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">
                        Confirm New Password
                      </Label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            confirmPassword: e.target.value,
                          })
                        }
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={
                        saveStatus === "saving" || passwordMutation.isPending
                      }
                    >
                      {saveStatus === "saving" || passwordMutation.isPending
                        ? "Updating..."
                        : "Update Password"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Avatar upload dialog */}
      <Dialog
        open={avatarUpload.isDialogOpen}
        onOpenChange={(open) => {
          if (!open && !avatarUpload.isUploading) {
            handleAvatarCancel();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Avatar</DialogTitle>
            <DialogDescription>
              Review your selected image and upload it as your avatar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center space-y-4">
            {avatarUpload.previewUrl && (
              <div className="relative">
                <Avatar className="h-32 w-32">
                  <AvatarImage
                    src={avatarUpload.previewUrl}
                    className="object-cover"
                  />
                  <AvatarFallback className="text-4xl">
                    {profileData.full_name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}

            {avatarUpload.selectedFile && (
              <div className="text-sm text-muted-foreground text-center">
                <p>{avatarUpload.selectedFile.name}</p>
                <p>
                  {(avatarUpload.selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={handleAvatarCancel}
              disabled={avatarUpload.isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAvatarUpload}
              disabled={!avatarUpload.selectedFile || avatarUpload.isUploading}
            >
              {avatarUpload.isUploading ? "Uploading..." : "Upload Avatar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
