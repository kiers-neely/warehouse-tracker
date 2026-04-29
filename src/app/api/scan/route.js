import { createClient } from '@supabase/supabase-js';

// Initialize the Admin Client (Bypasses RLS to manage status and deletions)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const maxDuration = 60;

const PUBLIC_SUBMISSION_LIMIT = 10;
const PUBLIC_SUBMISSION_WINDOW_MS = 60 * 60 * 1000;
const publicSubmissionRateLimit =
  globalThis.publicSubmissionRateLimit instanceof Map
    ? globalThis.publicSubmissionRateLimit
    : new Map();

globalThis.publicSubmissionRateLimit = publicSubmissionRateLimit;

function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function checkPublicSubmissionRateLimit(request) {
  const clientIp = getClientIp(request);
  const now = Date.now();
  const windowStart = now - PUBLIC_SUBMISSION_WINDOW_MS;
  const recentSubmissions = (publicSubmissionRateLimit.get(clientIp) || [])
    .filter((timestamp) => timestamp > windowStart);

  if (recentSubmissions.length >= PUBLIC_SUBMISSION_LIMIT) {
    const oldestSubmission = Math.min(...recentSubmissions);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestSubmission + PUBLIC_SUBMISSION_WINDOW_MS - now) / 1000)
    );

    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  recentSubmissions.push(now);
  publicSubmissionRateLimit.set(clientIp, recentSubmissions);

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

function normalizeUrl(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function determineCause(fireData) {
  const cause = fireData.cause?.trim().toLowerCase();
  if (!cause) return "unknown";
  if (cause === "arson") return "arson";
  if (cause === "accident") return "accident";
  return "unknown";
}

function normalizeIncidentLocation(fireData) {
  const city = fireData.city?.trim();
  const state = fireData.state?.trim().toUpperCase();

  if (!city || !state) {
    throw new Error("City and state are required");
  }

  return {
    city,
    state,
    location: `${city}, ${state}`,
  };
}

async function findCachedCoordinates(city, state) {
  const { data, error } = await supabaseAdmin
    .from("incidents")
    .select("latitude, longitude")
    .eq("city", city)
    .eq("state", state)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return null;
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
  };
}

async function geocodeCityState(city, state) {
  const cached = await findCachedCoordinates(city, state);

  if (cached) {
    return cached;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${city}, ${state}, USA`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "warehouse-fire-tracker/1.0 kneely@ucsd.edu",
    },
  });

  if (!response.ok) {
    throw new Error("Could not geocode this city/state");
  }

  const results = await response.json();
  const first = results?.[0];

  if (!first) {
    throw new Error(`No geocoding result found for ${city}, ${state}`);
  }

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
  };
}

async function buildIncidentPayload(fireData, status) {
  const { city, state, location } = normalizeIncidentLocation(fireData);
  const { latitude, longitude } = await geocodeCityState(city, state);

  return {
    title: fireData.title,
    city,
    state,
    location,
    latitude,
    longitude,
    facility_type: fireData.facility_type || null,
    url: normalizeUrl(fireData.url),
    date_occurred: fireData.date_occurred || null,
    cause: determineCause(fireData),
    status,
  };
}


/**
 * GET: Handles fetching data for the frontend.
 * Only returns approved incidents for public requests, but allows admins to filter by status.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminPassword = searchParams.get("admin_password");
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("incidents")
      .select("*")
      .order("date_occurred", { ascending: false });

    if (adminPassword === process.env.ADMIN_SECRET_PASSWORD) {
      if (status) query = query.eq("status", status);
    } else {
      query = query.eq("status", "approved");
    }

    const { data, error } = await query;

    if (error) throw error;

    const isPublic = adminPassword !== process.env.ADMIN_SECRET_PASSWORD;
    return Response.json({ incidents: data }, {
      headers: isPublic
        ? { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" }
        : { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Handles both Public Submissions and Admin Moderation.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { admin_password, action, id, ...fireData } = body;

  if (action === "list_pending") {
    if (admin_password !== process.env.ADMIN_SECRET_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("incidents")
        .select("*")
        .eq("status", "pending")
        .order("date_occurred", { ascending: false });

      if (error) throw error;

      return Response.json({ incidents: data });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // temporary backfill action for existing entries without location - can be removed in the future
  if (action === "backfill_geocodes") {
  if (admin_password !== process.env.ADMIN_SECRET_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: incidents, error: fetchError } = await supabaseAdmin
      .from("incidents")
      .select("id, city, state, location")
      .or("latitude.is.null,longitude.is.null")
      .not("city", "is", null)
      .not("state", "is", null)
      .limit(25);

    if (fetchError) throw fetchError;

    const results = [];

    for (const incident of incidents || []) {
      try {
        const geo = await geocodeCityState(incident.city, incident.state);

        const { error: updateError } = await supabaseAdmin
          .from("incidents")
          .update({
            latitude: geo.latitude,
            longitude: geo.longitude,
          })
          .eq("id", incident.id);

        if (updateError) throw updateError;

        results.push({
          id: incident.id,
          location: incident.location,
          status: "updated",
        });

        await new Promise((resolve) => setTimeout(resolve, 1100));
      } catch (err) {
        results.push({
          id: incident.id,
          location: incident.location,
          status: "failed",
          error: err.message,
        });
      }
    }

    return Response.json({
      message: `Backfill attempted for ${results.length} incidents`,
      results,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}


  // --- ADMIN EDIT (Update fields of a pending entry, optionally re-approve) ---
  if (action === 'edit') {
    if (admin_password !== process.env.ADMIN_SECRET_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const updates = {};

      if (fireData.title !== undefined) updates.title = fireData.title;
      if (fireData.facility_type !== undefined) updates.facility_type = fireData.facility_type || null;
      if (fireData.date_occurred !== undefined) updates.date_occurred = fireData.date_occurred || null;
      if (fireData.url !== undefined) updates.url = normalizeUrl(fireData.url);
      if (fireData.cause !== undefined) updates.cause = determineCause({ cause: fireData.cause });

      const cityChanged = fireData.city !== undefined;
      const stateChanged = fireData.state !== undefined;

      if (cityChanged || stateChanged) {
        const { city, state, location } = normalizeIncidentLocation({
          city: fireData.city,
          state: fireData.state,
        });
        updates.city = city;
        updates.state = state;
        updates.location = location;

        const geo = await geocodeCityState(city, state);
        updates.latitude = geo.latitude;
        updates.longitude = geo.longitude;
      }

      if (fireData.status !== undefined) updates.status = fireData.status;

      const { data, error } = await supabaseAdmin
        .from('incidents')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      return Response.json({ message: "Incident updated", entry: data?.[0] });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // --- LOGIC 1: ADMIN MODERATION (Approve or Delete) ---
  if (action === 'moderate') {
    if (admin_password !== process.env.ADMIN_SECRET_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      if (fireData.status === 'deleted') {
        const { error } = await supabaseAdmin
          .from('incidents')
          .delete()
          .eq('id', id);
        if (error) throw error;
        return Response.json({ message: "Incident deleted" });
      } else {
        // Update status (e.g., from 'pending' to 'approved')
        const { error } = await supabaseAdmin
          .from('incidents')
          .update({ status: fireData.status })
          .eq('id', id);
        if (error) throw error;
        return Response.json({ message: `Status updated to ${fireData.status}` });
      }
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // --- LOGIC 2: ADMIN DIRECT ADD ---
  // If password is provided but no action, add directly as 'approved'
  if (admin_password === process.env.ADMIN_SECRET_PASSWORD && !action) {
    try {
      const incidentPayload = await buildIncidentPayload(fireData, 'approved');
      const { data, error } = await supabaseAdmin
        .from('incidents')
        .insert([incidentPayload])
        .select();
      if (error) throw error;
      return Response.json({ message: "Admin entry saved", entry: data[0] });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // --- LOGIC 3: PUBLIC SUBMISSION ---
  // No password needed, but status is strictly forced to 'pending'
  try {
    const rateLimit = checkPublicSubmissionRateLimit(request);

    if (!rateLimit.allowed) {
      return Response.json(
        { error: "Too many submissions. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const incidentPayload = await buildIncidentPayload(fireData, 'pending');
    
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert([incidentPayload])
      .select();

    if (error) throw error;
    return Response.json({ message: "Submission sent for review", entry: data[0] });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
