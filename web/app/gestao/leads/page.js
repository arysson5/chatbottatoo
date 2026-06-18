import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import LeadsStrategicDashboard from "@/app/_components/leads-strategic-dashboard";

export default async function LeadsStrategicPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return <LeadsStrategicDashboard />;
}

