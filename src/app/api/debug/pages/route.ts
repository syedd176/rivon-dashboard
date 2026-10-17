import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic: which Pages does a token see, and which have Instagram linked?
 *
 * Exists because `no_instagram` is a true but unhelpful answer — it does not
 * say WHICH Page is missing the link, and an owner with several Pages cannot
 * act on it.
 *
 * Temporary. Delete once Instagram connects reliably.
 */

export async function POST(req: NextRequest) {
  const { userToken } = (await req.json()) as { userToken?: string };
  if (!userToken) {
    return NextResponse.json({ error: "userToken required" }, { status: 400 });
  }

  const GRAPH = "https://graph.facebook.com/v25.0";

  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100`,
    { headers: { Authorization: `Bearer ${userToken}` } }
  );
  const pagesBody = await pagesRes.json();

  if (!pagesRes.ok) {
    return NextResponse.json({ error: pagesBody?.error }, { status: 400 });
  }

  const pages: { id: string; name: string; access_token: string }[] =
    pagesBody.data ?? [];

  const report = [];
  for (const page of pages) {
    const igRes = await fetch(
      `${GRAPH}/${page.id}?fields=instagram_business_account{id,username},connected_instagram_account{id,username}`,
      { headers: { Authorization: `Bearer ${page.access_token}` } }
    );
    const ig = await igRes.json();
    report.push({
      pageId: page.id,
      pageName: page.name,
      instagramBusinessAccount: ig.instagram_business_account ?? null,
      connectedInstagramAccount: ig.connected_instagram_account ?? null,
      error: ig.error ?? null,
    });
  }

  return NextResponse.json({ pageCount: pages.length, pages: report });
}
