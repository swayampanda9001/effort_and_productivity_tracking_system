import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import dataCSV from "@/assets/data.csv?raw";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Filter,
  FileText,
  Calendar,
  User,
} from "lucide-react";

interface ActionItem {
  "#": string;
  Raised: string;
  "Project ": string;
  Action: string;
  Owner: string;
  "Reference ": string;
  "Target Date": string;
  Status: string;
  Remark: string;
}

const ActionItemsPage = () => {
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ActionItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // Helper function to parse DD/MM/YYYY format
  const parseDate = (dateString: string) => {
    const [day, month, year] = dateString.split("/");
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  // Helper function to check if an item is overdue
  const isOverdue = (targetDate: string, status: string) => {
    if (status?.toLowerCase() === "closed") return false;
    if (!targetDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = parseDate(targetDate);
    target.setHours(0, 0, 0, 0);

    return target < today;
  };

  // Helper function to get computed status
  const getComputedStatus = (item: ActionItem) => {
    if (item.Status?.toLowerCase() === "closed") return "Closed";
    if (isOverdue(item["Target Date"], item.Status)) return "Overdue";
    return "Open";
  };

  useEffect(() => {
    // Parse CSV file directly
    const lines = dataCSV.split("\n");
    // Skip the first line (title row) and parse from the second line
    const csvWithoutTitle = lines.slice(1).join("\n");

    Papa.parse(csvWithoutTitle, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log("Parsed data:", results.data);
        const parsedData = results.data as ActionItem[];
        setActionItems(parsedData);
        setFilteredItems(parsedData);

        // Set default filter based on overdue count
        const overdueItems = parsedData.filter((item) => {
          if (item.Status?.toLowerCase() === "closed") return false;
          if (!item["Target Date"]) return false;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const target = parseDate(item["Target Date"]);
          target.setHours(0, 0, 0, 0);
          return target < today;
        });

        setStatusFilter(overdueItems.length > 0 ? "overdue" : "open");
        setLoading(false);
      },
      error: (error: any) => {
        console.error("Error parsing CSV:", error);
        setLoading(false);
      },
    });
  }, []);

  useEffect(() => {
    // Apply filters
    let filtered = actionItems;

    if (searchTerm) {
      filtered = filtered.filter(
        (item) =>
          item.Action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.Owner?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item["Project "]?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (item) =>
          getComputedStatus(item).toLowerCase() === statusFilter.toLowerCase()
      );
    }

    if (projectFilter !== "all") {
      filtered = filtered.filter((item) => item["Project "] === projectFilter);
    }

    setFilteredItems(filtered);
  }, [searchTerm, statusFilter, projectFilter, actionItems]);

  const getStatusBadge = (item: ActionItem) => {
    const status = getComputedStatus(item);
    switch (status.toLowerCase()) {
      case "closed":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Closed
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="destructive" className="bg-red-500">
            <XCircle className="h-3 w-3 mr-1" />
            Overdue
          </Badge>
        );
      case "open":
        return (
          <Badge variant="secondary" className="bg-yellow-500">
            <Clock className="h-3 w-3 mr-1" />
            Open
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const uniqueProjects = Array.from(
    new Set(actionItems.map((item) => item["Project "]).filter(Boolean))
  );

  // Calculate status counts
  const closedCount = actionItems.filter(
    (item) => getComputedStatus(item) === "Closed"
  ).length;
  const openCount = actionItems.filter(
    (item) => getComputedStatus(item) === "Open"
  ).length;
  const overdueCount = actionItems.filter(
    (item) => getComputedStatus(item) === "Overdue"
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading action items...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Action Items</h1>
        <p className="text-muted-foreground mt-2">
          Manage all your action items in one place.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          onClick={() => setStatusFilter("all")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Action Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {actionItems.length}
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900"
          onClick={() => setStatusFilter("closed")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
              Closed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">
              {closedCount}
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-900"
          onClick={() => setStatusFilter("open")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
              Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
              {openCount}
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900"
          onClick={() => setStatusFilter("overdue")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">
              {overdueCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search actions, owners, projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">All Statuses</span>
                </SelectItem>
                <SelectItem value="overdue">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-600"></span>
                    Overdue
                  </span>
                </SelectItem>
                <SelectItem value="open">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-600"></span>
                    Open
                  </span>
                </SelectItem>
                <SelectItem value="closed">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-600"></span>
                    Closed
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map((project) => (
                  <SelectItem key={project} value={project}>
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Action Items List */}
      <div className="space-y-4">
        {filteredItems.map((item, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">#{item["#"]}</Badge>
                    <Badge variant="secondary">{item["Project "]}</Badge>
                    {getStatusBadge(item)}
                  </div>
                  <CardTitle className="text-lg mb-2">{item.Action}</CardTitle>
                  <CardDescription className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Owner: {item.Owner}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Raised: {item.Raised}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Target: {item["Target Date"]}
                    </span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {item["Reference "] && (
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-1">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Reference
                    </div>
                    <p className="text-sm text-muted-foreground pl-6">
                      {item["Reference "]}
                    </p>
                  </div>
                )}
                {item.Remark && (
                  <div>
                    <div className="text-sm font-medium mb-1">Remarks</div>
                    <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md whitespace-pre-line">
                      {item.Remark}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">
              No action items found matching your filters.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setProjectFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ActionItemsPage;
