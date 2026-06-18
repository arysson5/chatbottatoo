import { NextResponse } from "next/server";
import { hasPasswordConfigured, isAuthenticated } from "@/lib/auth";

export async function GET() {
  const [hasPassword, authenticated] = await Promise.all([
    hasPasswordConfigured(),
    isAuthenticated(),
  ]);
  return NextResponse.json({ hasPassword, authenticated });
}

