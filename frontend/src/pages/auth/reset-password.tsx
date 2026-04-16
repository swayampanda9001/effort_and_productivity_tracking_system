import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import API from "@/lib/axios/instance";
import { Lock, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ThemeToggle";

interface ResetPasswordState {
  otp: string[];
  newPassword: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  error: string | null;
  isSuccess: boolean;
  step: 'verify' | 'reset'; // Two-step process
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const email = searchParams.get("email") || "";
  
  const [state, setState] = useState<ResetPasswordState>({
    otp: ["", "", "", "", "", ""],
    newPassword: "",
    confirmPassword: "",
    showPassword: false,
    showConfirmPassword: false,
    isLoading: false,
    isVerifying: false,
    error: null,
    isSuccess: false,
    step: 'verify',
  });

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first OTP input on mount
  useEffect(() => {
    if (state.step === 'verify' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [state.step]);

  // Redirect if no email provided
  useEffect(() => {
    if (!email) {
      navigate("/auth/forgot-password");
    }
  }, [email, navigate]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return; // Prevent multiple characters

    const newOtp = [...state.otp];
    newOtp[index] = value;
    setState((prev) => ({ ...prev, otp: newOtp, error: null }));

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !state.otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    const newOtp = pastedData.split("").concat(Array(6).fill("")).slice(0, 6);
    setState((prev) => ({ ...prev, otp: newOtp }));

    // Focus the next empty input or the last one
    const nextEmptyIndex = newOtp.findIndex((val) => !val);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerifyOtp = async () => {
    const otpString = state.otp.join("");

    if (otpString.length !== 6) {
      setState((prev) => ({ ...prev, error: "Please enter all 6 digits" }));
      return;
    }

    setState((prev) => ({ ...prev, isVerifying: true, error: null }));

    try {
      const response = await API.post("/auth/verify-password-reset-otp", {
        email: email,
        otp: otpString,
      });

      if (response.data.success) {
        // OTP verified successfully, move to password reset step
        setState((prev) => ({ 
          ...prev, 
          step: 'reset', 
          isVerifying: false,
          error: null 
        }));
      }
    } catch (error: any) {
      console.error("OTP verification error:", error);
      
      let errorMessage = "Invalid or expired OTP. Please try again.";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isVerifying: false,
      }));
      
      // Clear OTP inputs on error
      setState((prev) => ({ 
        ...prev, 
        otp: ["", "", "", "", "", ""] 
      }));
      inputRefs.current[0]?.focus();
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!state.newPassword) {
      setState((prev) => ({ ...prev, error: "Please enter a new password" }));
      return;
    }

    if (state.newPassword.length < 8) {
      setState((prev) => ({ ...prev, error: "Password must be at least 8 characters long" }));
      return;
    }

    if (state.newPassword !== state.confirmPassword) {
      setState((prev) => ({ ...prev, error: "Passwords do not match" }));
      return;
    }

    // Password strength validation
    const hasLower = /[a-z]/.test(state.newPassword);
    const hasUpper = /[A-Z]/.test(state.newPassword);
    const hasNumber = /\d/.test(state.newPassword);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(state.newPassword);

    if (!hasLower || !hasUpper || !hasNumber || !hasSpecial) {
      setState((prev) => ({ 
        ...prev, 
        error: "Password must contain at least one lowercase letter, uppercase letter, number, and special character" 
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // For password reset, we typically need to call a different endpoint
      // Since the backend uses verify-password-reset-otp, we need to implement password reset
      // For now, let's simulate the reset and then login
      
      // This is a placeholder - you may need to implement a separate password reset endpoint
      const response = await API.post("/auth/reset-password", {
        email: email,
        otp: state.otp.join(""),
        new_password: state.newPassword,
      });

      if (response.data.success) {
        setState((prev) => ({ 
          ...prev, 
          isSuccess: true, 
          isLoading: false 
        }));

        // Auto-redirect to login after success
        setTimeout(() => {
          navigate("/auth/login", { 
            state: { message: "Password reset successfully. Please login with your new password." }
          });
        }, 3000);
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      
      let errorMessage = "Failed to reset password. Please try again.";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
    }
  };

  const handleResendOtp = async () => {
    try {
      await API.post("/auth/send-password-reset-otp", {
        email: email,
        username: email,
      });
      
      // Reset form to verification step
      setState((prev) => ({
        ...prev,
        step: 'verify',
        otp: ["", "", "", "", "", ""],
        error: null,
      }));
      
      // Focus first input
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
      
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to resend OTP. Please try again.",
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
                  Password Reset Successful!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mt-2">
                  Your password has been successfully reset. Redirecting to login page...
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
          <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {state.step === 'verify' ? 'Verify Reset Code' : 'Set New Password'}
          </CardTitle>
          <CardDescription>
            {state.step === 'verify' 
              ? `Enter the 6-digit code sent to ${email}`
              : 'Create a strong new password for your account'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {state.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {state.step === 'verify' ? (
            // OTP Verification Step
            <>
              <div className="space-y-2">
                <Label htmlFor="otp">Verification Code</Label>
                <div className="flex gap-2 justify-center">
                  {state.otp.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) =>
                        handleOtpChange(index, e.target.value.replace(/\D/g, ""))
                      }
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className="w-12 h-12 text-center text-lg font-semibold"
                      disabled={state.isVerifying}
                    />
                  ))}
                </div>
              </div>

              <Button
                onClick={handleVerifyOtp}
                disabled={state.isVerifying || state.otp.join("").length !== 6}
                className="w-full"
              >
                {state.isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify Code"
                )}
              </Button>

              <div className="text-center">
                <Button
                  variant="ghost"
                  onClick={handleResendOtp}
                  className="text-sm text-primary hover:underline"
                >
                  Didn't receive the code? Resend
                </Button>
              </div>
            </>
          ) : (
            // Password Reset Step
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={state.showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    className="pl-10 pr-10"
                    value={state.newPassword}
                    onChange={(e) =>
                      setState((prev) => ({ 
                        ...prev, 
                        newPassword: e.target.value,
                        error: null 
                      }))
                    }
                    disabled={state.isLoading}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() =>
                      setState((prev) => ({ 
                        ...prev, 
                        showPassword: !prev.showPassword 
                      }))
                    }
                  >
                    {state.showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={state.showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    className="pl-10 pr-10"
                    value={state.confirmPassword}
                    onChange={(e) =>
                      setState((prev) => ({ 
                        ...prev, 
                        confirmPassword: e.target.value,
                        error: null 
                      }))
                    }
                    disabled={state.isLoading}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() =>
                      setState((prev) => ({ 
                        ...prev, 
                        showConfirmPassword: !prev.showConfirmPassword 
                      }))
                    }
                  >
                    {state.showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Password must contain:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>At least 8 characters</li>
                  <li>One uppercase letter</li>
                  <li>One lowercase letter</li>
                  <li>One number</li>
                  <li>One special character</li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={state.isLoading || !state.newPassword || !state.confirmPassword}
              >
                {state.isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
          )}

          <div className="text-center">
            <Link
              to="/auth/login"
              className="inline-flex items-center text-sm text-primary hover:underline"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
