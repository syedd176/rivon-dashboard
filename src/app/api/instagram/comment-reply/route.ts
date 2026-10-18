import { NextRequest, NextResponse } from "next/server";
import { getSocialCredentials } from "@/lib/channels-store";

/**
 * Reply to an Instagram comment — publicly, then privately.
 *
 * THE PATTERN, and why:
 *   1. A short PUBLIC reply under the comment. Everyone can see the business
 *      responds, which is most of the value of answering at all.
 *   2. A PRIVATE message to the same person, where the actual conversation
 *      happens — prices, addresses, availability.
 *
 * Keeping detail out of public view matters. A quote posted under a photo is
 * visible to every competitor and every future customer who will expect the
 * same number. The DM is also what opens the 24-hour window, so the agent can
 * keep talking afterwards.
 *
 * Step 2 is best-effort: Instagram only allows a private reply once per
 * comment, and it fails if the person has restricted messages. A failed DM
 * does not undo a successful public reply.
 */

const GRAPH = "https://graph.facebook.com/v25.0";

export async function POST(req: NextRequest) {
  const { commentId, publicReply, privateMessage, accountId } =
    (await req.json()) as {
      commentId?: string;
      publicReply?: string;
      privateMessage?: string;
      accountId?: string;
    };

  if (!commentId || !publicReply) {
    return NextResponse.json(
      { error: "A comment and a public reply are required." },
      { status: 400 }
    );
  }

  const creds = await getSocialCredentials("instagram", accountId);
  if (!creds) {
    return NextResponse.json(
      { error: "No connected Instagram account. Connect one on the Channels page." },
      { status: 503 }
    );
  }

  const result: {
    ok: boolean;
    publicReplyId?: string;
    privateSent: boolean;
    privateProblem?: string;
  } = { ok: false, privateSent: false };

  try {
    const base = creds.isDirect
      ? "https://graph.instagram.com/v23.0"
      : GRAPH;

    // 1. Public reply, under the comment.
    const pubRes = await fetch(`${base}/${commentId}/replies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: publicReply }),
    });
    const pubBody = await pubRes.json();

    if (!pubRes.ok) {
      // Meta reports a missing permission as "Object with ID ... does not
      // exist", which reads like a wrong id. The id came from Meta's own
      // webhook, so when subcode 33 appears the token simply does not carry
      // instagram_business_manage_comments — usually because the account was
      // connected before that permission was added to the app.
      // Subcode 33 on a comment id that Meta itself delivered means the
      // comment is not on this account's own media. Instagram sends webhooks
      // for comments the connected account MAKES on other people's posts as
      // well as comments it receives, and only the latter can be replied to.
      const notOurMedia =
        pubBody?.error?.error_subcode === 33 ||
        (pubBody?.error?.code === 100 &&
          String(pubBody?.error?.message ?? "").includes("does not exist"));

      return NextResponse.json(
        {
          error: notOurMedia
            ? "This comment is not on one of your own posts, so it cannot be replied to. Comment on a post belonging to the connected account to test this."
            : (pubBody?.error?.message ??
              "The public reply could not be posted."),
          code: pubBody?.error?.code,
        },
        { status: 400 }
      );
    }

    result.ok = true;
    result.publicReplyId = pubBody.id;

    // 2. Private reply. Allowed once per comment, and only if the person
    //    accepts messages — so a failure here is reported, not fatal.
    if (privateMessage) {
      const dmRes = await fetch(`${base}/${creds.pageId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text: privateMessage },
        }),
      });

      if (dmRes.ok) {
        result.privateSent = true;
      } else {
        const dmBody = await dmRes.json().catch(() => ({}));
        result.privateProblem =
          dmBody?.error?.message ??
          "The private message could not be sent. The public reply was posted.";
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Instagram. Please try again." },
      { status: 502 }
    );
  }
}
