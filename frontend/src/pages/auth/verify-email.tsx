import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import API from "@/lib/axios/instance";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Mail,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";

// Define types inline
interface EmailVerificationState {
  email: string;
  isVerified: boolean;
  isLoading: boolean;
  error: string | null;
  canResend: boolean;
  resendCooldown: number;
}

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const email = searchParams.get("email") || "";
  const { refreshUser, logout } = useAuth();

  const [state, setState] = useState<EmailVerificationState>({
    email,
    isVerified: false,
    isLoading: false,
    error: null,
    canResend: true,
    resendCooldown: 0,
  });

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [isResending, setIsResending] = useState(false);

  // Countdown timer for resend cooldown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state.resendCooldown > 0) {
      interval = setInterval(() => {
        setState((prev) => ({
          ...prev,
          resendCooldown: prev.resendCooldown - 1,
          canResend: prev.resendCooldown <= 1,
        }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state.resendCooldown]);

  // Auto-focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return; // Prevent multiple characters

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    const newOtp = pastedData.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(newOtp);

    // Focus the next empty input or the last one
    const nextEmptyIndex = newOtp.findIndex((val) => !val);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerifyOtp = async () => {
    const otpString = otp.join("");

    if (otpString.length !== 6) {
      setState((prev) => ({ ...prev, error: "Please enter all 6 digits" }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await API.post("/auth/verify-email-using-otp", {
        otp: otpString,
      });

      if (response.status === 200) {
        setState((prev) => ({ ...prev, isVerified: true }));
        await refreshUser(); // Refresh user data after verification
        navigate("/dashboard");
      } else {
        setState((prev) => ({
          ...prev,
          error: response.data.message || "Verification failed",
        }));
      }
    } catch (error) {
      console.error("Verification error:", error);
      setState((prev) => ({
        ...prev,
        error: "Verification failed. Please try again.",
      }));
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    setState((prev) => ({ ...prev, error: null }));

    try {
      const response = await API.get("/auth/resend-email-verification-otp");
      if (response.status === 200) {
        setState((prev) => ({
          ...prev,
          canResend: false,
          resendCooldown: 30, // 30 seconds cooldown
        }));
        setOtp(["", "", "", "", "", ""]); // Clear OTP inputs
        inputRefs.current[0]?.focus(); // Focus the first input
      } else {
        setState((prev) => ({
          ...prev,
          error: response.data.message || "Failed to resend OTP",
        }));
      }
    } catch (error) {
      console.error("Resend OTP error:", error);
      setState((prev) => ({
        ...prev,
        error: "Failed to resend OTP. Please try again.",
      }));
    } finally {
      setIsResending(false);
    }
  };

  if (state.isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md border-gray-200 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">
                  Email Verified!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mt-2">
                  Your email has been successfully verified. Redirecting to
                  dashboard...
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
      <Card className="w-full max-w-md border-gray-200 dark:border-gray-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Verify Your Email
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            We've sent a 6-digit verification code to{" "}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {state.email}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {state.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="gap-3 w-full flex flex-col items-center">
            <Label htmlFor="otp">Enter verification code</Label>
            <div className="flex gap-2 justify-center">
              {otp.map((digit, index) => (
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
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="w-8 h-8 sm:w-12 sm:h-12 text-center text-sm sm:text-lg font-semibold"
                  disabled={state.isLoading}
                />
              ))}
            </div>
          </div>

          <Button
            onClick={handleVerifyOtp}
            disabled={state.isLoading || otp.join("").length !== 6}
            className="w-full"
          >
            {state.isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify Email"
            )}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Didn't receive the code?
            </p>
            <Button
              variant="ghost"
              onClick={handleResendOtp}
              disabled={!state.canResend || isResending}
              className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
            >
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : state.canResend ? (
                "Resend Code"
              ) : (
                `Resend in ${state.resendCooldown}s`
              )}
            </Button>
          </div>

          <div className="text-center">
            <p
              onClick={() => logout()}
              className="cursor-pointer inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Registration
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
