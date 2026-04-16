import type React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "@/lib/axios/instance";
import { Mail, ArrowLeft, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";

interface ForgotPasswordState {
  email: string;
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<ForgotPasswordState>({
    email: "",
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState((prev) => ({
      ...prev,
      email: e.target.value,
      error: null, // Clear error when user types
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!state.email.trim()) {
      setState((prev) => ({ ...prev, error: "Please enter your email address" }));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
      setState((prev) => ({ ...prev, error: "Please enter a valid email address" }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await API.post("/auth/send-password-reset-otp", {
        email: state.email,
      });
      console.log(response)
      if (response.status === 200) {
        setState((prev) => ({ 
          ...prev, 
          isSuccess: true, 
          isLoading: false 
        }));
        
        // Redirect to reset password page after 2 seconds
        setTimeout(() => {
          navigate(`/auth/reset-password?email=${encodeURIComponent(state.email)}`);
        }, 2000);
      }
    } catch (error: any) {
      console.error("Forgot password error:", error);
      
      let errorMessage = "Failed to send reset email. Please try again.";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.status === 404) {
        errorMessage = "No account found with this email address";
      }
      
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
    }
  };

  if (state.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-primary/10 p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">
                  Email Sent!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mt-2">
                  We've sent a password reset code to{" "}
                  <span className="font-medium">{state.email}</span>.
                  Redirecting to reset page...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-primary/10 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold">Forgot Password?</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a code to reset your password
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@example.com"
                  className="pl-10"
                  value={state.email}
                  onChange={handleInputChange}
                  disabled={state.isLoading}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                We'll send a 6-digit code to this email address
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={state.isLoading || !state.email.trim()}
            >
              {state.isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Reset Code...
                </>
              ) : (
                "Send Reset Code"
              )}
            </Button>

            <div className="text-center space-y-2">
              <Link
                to="/auth/login"
                className="inline-flex items-center text-sm text-primary hover:underline"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Login
              </Link>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link to="/auth/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
