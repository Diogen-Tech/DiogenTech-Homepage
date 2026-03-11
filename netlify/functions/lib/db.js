/**
 * Supabase REST API helpers (no SDK needed – uses native fetch)
 * Env vars required:
 *   SUPABASE_URL  – e.g. https://xxxx.supabase.co
 *   SUPABASE_KEY  – anon / service-role key
 *
 * Tables required (see /docs/supabase-schema.sql):
 *   sessions (phone PK, state, data jsonb, updated_at)
 *   donors   (phone PK, blood_group, last_donated_date, latitude, longitude, updated_at)
 */

const RADIUS_KM = 15; // search radius

function base() {
  return `${process.env.SUPABASE_URL}/rest/v1`;
}

function sbHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
    ...extra,
  };
}

async function sbFetch(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`${base()}${path}`, {
    headers: sbHeaders(extraHeaders),
    ...rest,
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Supabase [${res.status}] ${path}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

// ── Sessions ────────────────────────────────────────────────────────────────

async function getSession(phone) {
  const rows = await sbFetch(
    `/sessions?phone=eq.${encodeURIComponent(phone)}&select=*`
  );
  return rows?.[0] ?? null;
}

async function setSession(phone, state, data = {}) {
  return sbFetch(`/sessions`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      phone,
      state,
      data,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function clearSession(phone) {
  return setSession(phone, "IDLE", {});
}

// ── Donors ──────────────────────────────────────────────────────────────────

async function upsertDonor(phone, fields) {
  return sbFetch(`/donors`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      phone,
      ...fields,
      updated_at: new Date().toISOString(),
    }),
  });
}

/**
 * Fetch eligible donors for a blood group.
 * "Eligible" = last_donated_date is at least 120 days ago.
 * Proximity filtering is done in JS via Haversine (avoids PostGIS requirement).
 */
async function findEligibleDonors(bloodGroup, lat, lng) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 120);
  const isoDate = cutoff.toISOString().split("T")[0];

  const rows = await sbFetch(
    `/donors?blood_group=eq.${encodeURIComponent(bloodGroup)}` +
      `&last_donated_date=lte.${isoDate}` +
      `&latitude=not.is.null&longitude=not.is.null` +
      `&select=phone,blood_group,last_donated_date,latitude,longitude`
  );

  if (!rows?.length) return [];

  // Haversine filter
  return rows
    .map((d) => ({ ...d, distKm: haversine(lat, lng, d.latitude, d.longitude) }))
    .filter((d) => d.distKm <= RADIUS_KM)
    .sort((a, b) => a.distKm - b.distKm);
}

// ── Haversine ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  getSession,
  setSession,
  clearSession,
  upsertDonor,
  findEligibleDonors,
  RADIUS_KM,
};
