import type React from "react";
import { useState, useEffect, useCallback } from "react";
import type { TeamMember } from "@/types/user";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Search, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import API from "@/lib/axios/instance";

// Custom debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

interface AddTeamMemberProps {
  onAddMembers: (members: TeamMember[]) => void;
  onOpenChange: (open: boolean) => void;
  isOpen?: boolean;
  trigger?: React.ReactNode;
}

export default function AddTeamMember({
  onAddMembers,
  isOpen,
  onOpenChange,
  trigger,
}: AddTeamMemberProps) {
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TeamMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Use debounce hook for search query
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Search for users with debounced query
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await API.get(
        `/users/search?q=${encodeURIComponent(query)}`
      );
      // Backend returns users directly as an array
      setSearchResults(response.data || []);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Trigger search when debounced query changes
  useEffect(() => {
    searchUsers(debouncedSearchQuery);
  }, [debouncedSearchQuery, searchUsers]);

  // Handle search input change (no debouncing here, just update state)
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (error) setError(null); // Clear error when user starts typing
  };

  // Select a user from search results (add to selected members)
  const selectUser = (user: TeamMember) => {
    // const newMember: User = {
    //   id: user.id,
    //   full_name: user.full_name || user.username,
    //   email: user.email,
    // };

    // Check if user is already selected
    if (selectedMembers.some((member) => member.id === user.id)) {
      setError("This user is already selected");
      return;
    }

    setSelectedMembers((prev) => [...prev, user]);
    setSearchQuery(""); // Clear search after selection
    setShowSearchResults(false);
    setSearchResults([]);
    if (error) setError(null);
  };

  // Remove a selected member
  const removeSelectedMember = (memberId: number) => {
    setSelectedMembers((prev) =>
      prev.filter((member) => member.id !== memberId)
    );
  };

  // Clear search when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setShowSearchResults(false);
      setSelectedMembers([]);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (selectedMembers.length === 0) {
      setError("Please select at least one team member");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const members = [
        ...selectedMembers.map((member) => ({
          email: member.email,
        })),
      ];
      console.log(members);
      const response = await API.put("/team-members/add", members);

      if (response.status !== 200) {
        throw new Error("Failed to add team members");
      }

      console.log("Team members response:", response.data);

      // Handle the new response format with sent_requests and skipped_requests
      const { sent_requests, skipped_requests, total_processed } =
        response.data;

      // Show toast messages based on results
      if (sent_requests && sent_requests.length > 0) {
        if (sent_requests.length === 1) {
          toast.success(
            `Team joining request sent to ${sent_requests[0].user_name}`
          );
        } else {
          toast.success(
            `Team joining requests sent to ${sent_requests.length} members`
          );
        }
      }

      if (skipped_requests && skipped_requests.length > 0) {
        if (skipped_requests.length === 1) {
          toast.info(
            `Request to ${skipped_requests[0].full_name} was skipped - ${skipped_requests[0].reason}`
          );
        } else {
          toast.info(
            `${skipped_requests.length} requests were skipped - already pending from this manager`
          );
        }
      }

      // If all requests were skipped, show a warning
      if (sent_requests.length === 0 && skipped_requests.length > 0) {
        toast.warning(
          "All selected members already have pending requests from you"
        );
      }

      // Only call onAddMembers for successfully sent requests
      // if (sent_requests && sent_requests.length > 0) {
      //   const sentMembers = selectedMembers.filter(member =>
      //     sent_requests.some((req: any) => req.email === member.email)
      //   );
      //   onAddMembers(sentMembers);
      // }

      // Reset form
      setSelectedMembers([]);
      setSearchQuery("");

      // Close dialog
      onOpenChange(false);
    } catch (err) {
      console.error("Error adding team members:", err);
      toast.error("Failed to send team joining requests. Please try again.");
      setError("Failed to add team members. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultTrigger = (
    <Button className="flex items-center gap-2">
      <UserPlus className="h-4 w-4" />
      Add Team Members
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Team Members</DialogTitle>
          <DialogDescription>
            Search and select team members to add to your project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Search Section */}
          <div className="space-y-2">
            <Label htmlFor="userSearch">Search for Team Members</Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Search className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <Input
                id="userSearch"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Search Results */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="border rounded-md shadow-sm bg-background max-h-40 overflow-y-auto">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 focus:outline-none border-b last:border-b-0"
                  >
                    <div className="font-medium">
                      {user.full_name || user.username}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showSearchResults &&
              searchResults.length === 0 &&
              searchQuery.length >= 2 &&
              !isSearching && (
                <div className="text-sm text-muted-foreground p-2 border rounded-md">
                  No users found matching your search.
                </div>
              )}
          </div>

          {/* Selected Members */}
          {selectedMembers.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Team Members ({selectedMembers.length})</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-md border"
                  >
                    <div>
                      <div className="font-medium">{member.full_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {member.email}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSelectedMember(member.id!)}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || selectedMembers.length === 0}
            >
              {isSubmitting
                ? "Adding..."
                : `Add ${selectedMembers.length} Member${
                    selectedMembers.length > 1 ? "s" : ""
                  }`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
