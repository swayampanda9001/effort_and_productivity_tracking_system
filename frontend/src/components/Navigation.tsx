import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  Calendar1,
  CheckSquare,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavigationProps {
  userRole: "team_member" | "pm" | "sm";
  userName: string;
  userEmail: string;
  userAvatar: string;
}

export function Navigation({
  userRole,
  userName,
  userEmail,
  userAvatar,
}: NavigationProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  const teamMemberNavItems = [
    { href: "/dashboard/team_member", label: "Dashboard", icon: Home },
    {
      href: "/dashboard/team_member/sprints",
      label: "Sprints",
      icon: Calendar,
    },
    { href: "/dashboard/team_member/calendar", label: "Calendar", icon: Calendar },
  ];

  const managerNavItems = [
    { href: "/dashboard/pm", label: "Dashboard", icon: Home },
    { href: "/dashboard/pm/sprints", label: "Sprints", icon: Calendar },
    { href: "/dashboard/pm/action-items", label: "Action Tracker", icon: ClipboardList },
    { href: "/dashboard/pm/calendar", label: "Calendar", icon: Calendar1 },
    {
      href: "/dashboard/pm/sync-tasks",
      label: "Backlog",
      icon: CheckSquare,
    },
    {
      href: "/dashboard/pm/team-overview",
      label: "Team Overview",
      icon: Users,
    },
  ];

  const navItems =
    userRole === "team_member" ? teamMemberNavItems : managerNavItems;

  return (
    <nav className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center h-full">
            <div
              className="flex-shrink-0 flex items-center gap-2 cursor-pointer"
              onClick={() => navigate(`/dashboard/${userRole}`)}
            >
              <img src="/trinova-logo.png" alt="Logo" className="w-8 sm:w-9 h-auto" />
              <p className="font-sans text-xl lg:text-2xl tracking-wider font-bold text-zinc-800 dark:text-zinc-300">
                TriNova
              </p>
            </div>
            <div className="h-full hidden md:ml-6 md:flex md:space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`inline-flex items-center px-1 pt-2 text-sm font-medium border-b-2 ${
                      pathname === item.href
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="hidden md:flex md:items-center md:gap-4">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      className="object-cover"
                      src={`${import.meta.env.VITE_R2_BASE_URL}${userAvatar}`}
                      alt={userName}
                    />
                    <AvatarFallback>
                      {userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {userName}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {userEmail}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/profile")}
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>

          <div className="md:hidden flex items-center gap-2">
            {/* <ThemeToggle /> */}
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-6 w-6 rounded-full"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      className="object-cover"
                      src={`${import.meta.env.VITE_R2_BASE_URL}${userAvatar}`}
                      alt={userName}
                    />
                    <AvatarFallback>
                      {userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {userName}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {userEmail}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/profile")}
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              className="p-0"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-8 w-8" size={24} />
              )}
            </Button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-base font-medium ${
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
            <div className="flex items-center cursor-pointer rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent">
              <ThemeToggle /> <span className="sr-only">Toggle theme</span>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
