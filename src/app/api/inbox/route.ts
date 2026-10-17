import { NextResponse } from "next/server";
import { getInbox } from "@/lib/inbox";


/** Feeds the live inbox view. Replaced by a real query once Postgres exists. */
export async function GET() {
  return NextResponse.json(getInbox());
}
