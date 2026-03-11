/**
 * Meta (Facebook/Instagram) Webhook Handler
 * Netlify Serverless Function
 *
 * Endpoint: /.netlify/functions/meta-webhook
 *
 * Setup in Meta App Dashboard:
 *   Callback URL: https://<your-site>.netlify.app/.netlify/functions/meta-webhook
 *   Verify Token:  Set META_VERIFY_TOKEN in Netlify environment variables
 *
 * Required Environment Variables (set in Netlify Dashboard > Site Settings > Environment Variables):
 *   META_VERIFY_TOKEN  - A secret string you define; must match what you enter in Meta App Dashboard
 *   META_APP_SECRET    - Your Meta App Secret (used to verify payload signatures)
 */

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Helper – verify the X-Hub-Signature-256 header sent by Meta
// ---------------------------------------------------------------------------
function verifySignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body, headers } = event;

  // ── GET ── Webhook Verification (Meta sends this when you save the webhook)
  if (httpMethod === "GET") {
    const mode      = queryStringParameters?.["hub.mode"];
    const token     = queryStringParameters?.["hub.verify_token"];
    const challenge = queryStringParameters?.["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      console.log("✅ Meta webhook verified successfully.");
      return {
        statusCode: 200,
        body: challenge,
      };
    }

    console.warn("⚠️  Webhook verification failed – token mismatch or wrong mode.");
    return { statusCode: 403, body: "Forbidden" };
  }

  // ── POST ── Receiving webhook events
  if (httpMethod === "POST") {
    // 1. Verify signature (optional but strongly recommended)
    const signature = headers["x-hub-signature-256"];
    if (process.env.META_APP_SECRET) {
      const isValid = verifySignature(body, signature, process.env.META_APP_SECRET);
      if (!isValid) {
        console.error("❌ Signature verification failed.");
        return { statusCode: 401, body: "Unauthorized" };
      }
    }

    // 2. Parse payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return { statusCode: 400, body: "Bad Request – invalid JSON" };
    }

    // 3. Route events by object type
    const object = payload?.object;
    const entries = payload?.entry ?? [];

    console.log(`📨 Received webhook | object: ${object} | entries: ${entries.length}`);

    for (const entry of entries) {
      // ── Page / Feed events
      if (object === "page") {
        for (const change of entry.changes ?? []) {
          await handlePageChange(change, entry.id);
        }
      }

      // ── Instagram events
      if (object === "instagram") {
        for (const change of entry.changes ?? []) {
          await handleInstagramChange(change, entry.id);
        }
      }

      // ── WhatsApp Business events
      if (object === "whatsapp_business_account") {
        for (const change of entry.changes ?? []) {
          await handleWhatsAppChange(change, entry.id);
        }
      }
    }

    // Always respond 200 quickly so Meta doesn't retry
    return { statusCode: 200, body: "EVENT_RECEIVED" };
  }

  // Any other method
  return { statusCode: 405, body: "Method Not Allowed" };
};

// ---------------------------------------------------------------------------
// Event handlers – add your business logic here
// ---------------------------------------------------------------------------

async function handlePageChange(change, pageId) {
  const { field, value } = change;
  console.log(`📄 Page [${pageId}] | field: ${field}`, JSON.stringify(value));

  switch (field) {
    case "feed":
      // New post, comment, like, etc.
      console.log("  → Feed change detected:", value?.item, value?.verb);
      break;
    case "messages":
      // Messenger message received
      console.log("  → New Messenger message from:", value?.sender?.id);
      break;
    case "leadgen":
      // Lead form submission
      console.log("  → New lead gen form submission. Lead ID:", value?.leadgen_id);
      break;
    default:
      console.log(`  → Unhandled page field: ${field}`);
  }
}

async function handleInstagramChange(change, accountId) {
  const { field, value } = change;
  console.log(`📸 Instagram [${accountId}] | field: ${field}`, JSON.stringify(value));

  switch (field) {
    case "comments":
      console.log("  → New IG comment:", value?.text, "from:", value?.from?.username);
      break;
    case "mentions":
      console.log("  → New IG mention in media:", value?.media_id);
      break;
    case "messages":
      console.log("  → New IG Direct Message from:", value?.sender?.id);
      break;
    default:
      console.log(`  → Unhandled instagram field: ${field}`);
  }
}

async function handleWhatsAppChange(change, wabaId) {
  const { field, value } = change;
  console.log(`💬 WhatsApp [${wabaId}] | field: ${field}`);

  if (field === "messages") {
    for (const msg of value?.messages ?? []) {
      console.log("  → Message type:", msg.type, "from:", msg.from);
      if (msg.type === "text") {
        console.log("    Text:", msg.text?.body);
      }
    }
  }
}
