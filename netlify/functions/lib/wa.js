/**
 * WhatsApp Cloud API helpers
 * Env vars required:
 *   WHATSAPP_TOKEN    – System user / page access token
 *   WHATSAPP_PHONE_ID – Phone Number ID from Meta App Dashboard
 */

const API_VERSION = "v19.0";

function waUrl() {
  return `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`;
}

function waHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };
}

// ── Low-level sender ────────────────────────────────────────────────────────
async function send(to, payload) {
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    ...payload,
  });

  const res = await fetch(waUrl(), {
    method: "POST",
    headers: waHeaders(),
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WA] send failed to ${to}:`, err);
  }
  return res;
}

// ── Plain text ──────────────────────────────────────────────────────────────
function sendText(to, text) {
  return send(to, { type: "text", text: { body: text, preview_url: false } });
}

// ── Interactive buttons (max 3) ─────────────────────────────────────────────
// buttons: [{ id, title }]
function sendButtons(to, bodyText, buttons) {
  return send(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

// ── Interactive list (max 10 rows per section) ──────────────────────────────
// sections: [{ title, rows: [{ id, title, description? }] }]
function sendList(to, bodyText, buttonLabel, sections) {
  return send(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  });
}

// ── Location request ────────────────────────────────────────────────────────
function sendLocationRequest(to, bodyText) {
  return send(to, {
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: bodyText },
      action: { name: "send_location" },
    },
  });
}

module.exports = { sendText, sendButtons, sendList, sendLocationRequest };
