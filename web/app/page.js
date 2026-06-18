import { redirect } from "next/navigation";
import AdminDashboard from "@/app/_components/admin-dashboard";
import { isAuthenticated } from "@/lib/auth";

export default async function Home() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return <AdminDashboard />;
}
