import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readDb } from "@/lib/simple-db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const db = await readDb();
  const leads = [...db.leads].sort((a, b) => {
    const aDate = new Date(a?.createdAt || 0).getTime();
    const bDate = new Date(b?.createdAt || 0).getTime();
    return bDate - aDate;
  });
  const outcomes = [...(db.leadOutcomes || [])].sort((a, b) => {
    const aDate = new Date(a?.createdAt || 0).getTime();
    const bDate = new Date(b?.createdAt || 0).getTime();
    return bDate - aDate;
  });

  return NextResponse.json({ leads, outcomes });
}

