import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";

export default function ManagerTabs() {
  const [selectedTab, setSelectedTab] = useState("overview");
  const navigate = useNavigate();

  const tabs = [
    { value: "overview", label: "Overview", url: "/dashboard/manager" },
    { value: "team", label: "Team", url: "/dashboard/manager/team-overview" },
    {
      value: "sprints",
      label: "Sprints",
      url: "/dashboard/manager/sprints",
    },
    {
      value: "analytics",
      label: "Analytics",
      url: "/dashboard/manager/analytics",
    },
  ];

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab} className="my-8">
      <TabsList className="grid w-full grid-cols-4">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            onClick={() => {
              setSelectedTab(tab.value);
              navigate(tab.url);
            }}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
