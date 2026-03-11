/**
 * Meta Webhook Handler – Netlify Serverless Function
 *
 * Production Endpoints:
 *   https://xyz.com/.netlify/functions/meta-webhook   ← use this in Meta Dashboard
 *   https://xyz.com/api/meta-webhook                  ← friendly alias
 *
 * Required Environment Variables (Netlify → Site Settings → Environment Variables):
 *   META_VERIFY_TOKEN   – The token you enter in Meta App Dashboard
 *   META_APP_SECRET     – Your Meta App Secret (for payload signature verification)
 *   WHATSAPP_TOKEN      – WhatsApp System User / Page Access Token
 *   WHATSAPP_PHONE_ID   – Phone Number ID from Meta App Dashboard
 *   SUPABASE_URL        – e.g. https://xxxx.supabase.co
 *   SUPABASE_KEY        – Supabase anon or service-role key
 */

const crypto = require("crypto");
const bot    = require("./lib/bot");

// ── Signature verification ───────────────────────────────────────────────────
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body, headers } = event;

  // ── GET: Webhook verification handshake ─────────────────────────────────
  if (httpMethod === "GET") {
    const mode      = queryStringParameters?.["hub.mode"];
    const token     = queryStringParameters?.["hub.verify_token"];
    const challenge = queryStringParameters?.["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      console.log("✅ Meta webhook verified.");
      return { statusCode: 200, body: challenge };
    }
    console.warn("⚠️  Webhook verification failed – token mismatch.");
    return { statusCode: 403, body: "Forbidden" };
  }

  // ── POST: Incoming events ────────────────────────────────────────────────
  if (httpMethod === "POST") {
    // Verify payload signature
    const signature = headers["x-hub-signature-256"];
    if (process.env.META_APP_SECRET) {
      if (!verifySignature(body, signature, process.env.META_APP_SECRET)) {
        console.error("❌ Signature verification failed.");
        return { statusCode: 401, body: "Unauthorized" };
      }
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return { statusCode: 400, body: "Bad Request – invalid JSON" };
    }

    await processPayload(payload);

    return { statusCode: 200, body: "EVENT_RECEIVED" };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};

// ── Payload router ────────────────────────────────────────────────────────────
async function processPayload(payload) {
  const object  = payload?.object;
  const entries = payload?.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (object === "whatsapp_business_account" && change.field === "messages") {
        await processWhatsAppChange(change.value);
      }
    }
  }
}

// ── WhatsApp messages ─────────────────────────────────────────────────────────
async function processWhatsAppChange(value) {
  const messages = value?.messages;
  if (!messages?.length) return; // ignore status updates (value.statuses)

  for (const message of messages) {
    const phone = message.from; // e.g. "8801711234567"

    const supported = ["text", "interactive", "location"];
    if (!supported.includes(message.type)) {
      console.log(`[WA] Skipping unsupported type: ${message.type} from ${phone}`);
      continue;
    }

    try {
      await bot.handleMessage(phone, message);
    } catch (err) {
      console.error(`[WA] Error handling message from ${phone}:`, err);
    }
  }
}
