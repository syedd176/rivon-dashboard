import { NextResponse, connection } from "next/server";
import { getInbox } from "@/lib/inbox";


/** Feeds the live inbox view. */
export async function GET() {
  // Reads the database, so it cannot be prerendered at build time.
  await connection();
  return NextResponse.json(await getInbox());
}
