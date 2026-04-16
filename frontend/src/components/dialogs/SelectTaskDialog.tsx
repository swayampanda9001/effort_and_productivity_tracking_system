import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import API from "@/lib/axios/instance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import CreateSprintTaskDialog from "./CreateSprintTaskDialog";

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  estimated_effort_hours: number;
  due_date: string;
  stage: string;
  sprint_id?: number;
  tags?: string[];
}

interface SelectTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string | undefined;
  sprintName?: string;
  onTasksSelected?: (tasks: Task[]) => void;
  onTaskCreated?: () => void;
}

function SelectTaskDialog({
  open,
  onOpenChange,
  sprintId,
  sprintName = "Sprint",
  onTasksSelected,
  onTaskCreated,
}: SelectTaskDialogProps) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Fetch unassigned tasks from backlog (tasks without sprint_id)
  const { data: backlogTasks = [], isLoading } = useQuery({
    queryKey: ["backlog-tasks"],
    queryFn: async () => {
      // Get all tasks, then filter for unassigned ones
      const response = await API.get("/tasks/?sprint_id=null");
      // Filter out tasks that already have a sprint_id
      return response.data.filter((task: Task) => !task.sprint_id);
    },
    enabled: open,
  });

  const filteredTasks = backlogTasks.filter((task: Task) =>
    task.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTaskToggle = (taskId: number) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleConfirm = async () => {
    if (selectedTaskIds.length === 0) {
      return;
    }

    try {
      // Update each selected task to assign it to the sprint
      const tasksToAdd = backlogTasks.filter((task: Task) =>
        selectedTaskIds.includes(task.id)
      );

      // Call callback with selected tasks
      onTasksSelected?.(tasksToAdd);

      // Reset state and close dialog
      setSelectedTaskIds([]);
      setSearchTerm("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error selecting tasks:", error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Tasks from Backlog
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Tasks from Backlog</DialogTitle>
          <DialogDescription>
            Select existing backlog tasks to add to this sprint
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Tasks List */}
          <div className="flex-1 overflow-y-auto space-y-2 border rounded-lg p-3">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading tasks...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {backlogTasks.length === 0
                  ? "No tasks available in backlog"
                  : "No tasks match your search"}
              </div>
            ) : (
              filteredTasks.map((task: Task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleTaskToggle(task.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.includes(task.id)}
                    onChange={() => handleTaskToggle(task.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">{task.title}</h4>
                      <Badge variant={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{task.estimated_effort_hours}h estimated</span>
                      <span>•</span>
                      <span>
                        Due: {new Date(task.due_date).toLocaleDateString()}
                      </span>
                    </div>
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.tags.map((tag: string, index: number) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-4 border-t flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowCreateDialog(true)}
            className="flex-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Task
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedTaskIds.length === 0}
            className="flex-1"
          >
            Add {selectedTaskIds.length} Task
            {selectedTaskIds.length !== 1 ? "s" : ""}
          </Button>
        </div>

        {/* Create Sprint Task Dialog */}
        <CreateSprintTaskDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          sprintId={sprintId}
          sprintName={sprintName}
          onTaskCreated={() => {
            onTaskCreated?.();
            // Optionally close the select dialog after creating a task
            // or just refresh the list
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default SelectTaskDialog;
