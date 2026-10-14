/**
 * Create a WhatsApp message template.
 *
 * For App Review video 2, which requires evidence of the
 * whatsapp_business_management permission: "make API test calls and record a
 * separate unique video of creating a message template."
 *
 * Record your terminal while running this. The reviewer needs to see the call
 * go out and the success response come back.
 *
 *   node scripts/create-template.mjs
 *
 * Needs WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN in .env.local.
 * Both are on the WhatsApp API Setup page in the App Dashboard.
 */

import { readFileSync } from "node:fs";

// Minimal .env.local reader — avoids a dependency for a one-off script.
function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // No .env.local — fall back to the real environment.
  }
}
loadEnv();

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

if (!WABA_ID || !TOKEN) {
  console.error(
    "\nMissing credentials.\n\n" +
      "Add these to .env.local from the WhatsApp API Setup page:\n" +
      "  WHATSAPP_BUSINESS_ACCOUNT_ID=\n" +
      "  WHATSAPP_ACCESS_TOKEN=\n"
  );
  process.exit(1);
}

// A quotation-approval template — the real one this product needs, not a
// throwaway. The owner receives this on their phone and approves from it.
const template = {
  name: `rivon_quote_ready_${Date.now().toString().slice(-6)}`,
  language: "en_GB",
  category: "UTILITY",
  components: [
    {
      type: "BODY",
      text:
        "A quote is ready for {{1}}.\n\n" +
        "Job: {{2}}\n" +
        "Total: {{3}}\n\n" +
        "Review it before it goes to the customer.",
      example: {
        body_text: [["Sarah Chen", "3-bed deep clean", "GBP 180.00"]],
      },
    },
    {
      type: "FOOTER",
      text: "Rivon",
    },
  ],
};

console.log("\nCreating WhatsApp message template");
console.log("  Business account:", WABA_ID);
console.log("  Template name:   ", template.name);
console.log("  Category:        ", template.category);
console.log("\nPOST https://graph.facebook.com/v25.0/" + WABA_ID + "/message_templates\n");

const res = await fetch(
  `https://graph.facebook.com/v25.0/${WABA_ID}/message_templates`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(template),
  }
);

const body = await res.json();

if (!res.ok) {
  console.error("FAILED\n");
  console.error(JSON.stringify(body, null, 2));
  if (body?.error?.code === 190) {
    console.error(
      "\nThe access token has expired. Temporary tokens last 24 hours."
    );
  }
  process.exit(1);
}

console.log("TEMPLATE CREATED\n");
console.log(JSON.stringify(body, null, 2));
console.log(
  "\nStatus is PENDING until Meta reviews it, usually within a few minutes.\n"
);
