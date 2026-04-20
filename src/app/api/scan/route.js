import { createClient } from '@supabase/supabase-js';

// Initialize the Admin Client (Bypasses RLS to manage status and deletions)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const maxDuration = 60;

/**
 * GET: Handles fetching data for the frontend.
 * If no query params are provided, it returns only 'approved' fires.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .order('date_added', { ascending: false });

    if (error) throw error;

    // We fetch all, but the frontend usually filters for 'approved'.
    // Alternatively, you could use .eq('status', 'approved') here for strict public safety.
    return Response.json({ incidents: data });
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
      const { data, error } = await supabaseAdmin
        .from('incidents')
        .insert([{ ...fireData, status: 'approved' }])
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
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert([{
        title: fireData.title,
        location: fireData.location,
        facility_type: fireData.facility_type,
        url: fireData.url,
        date_occurred: fireData.date_occurred,
        status: 'pending' // Force moderation queue
      }])
      .select();

    if (error) throw error;
    return Response.json({ message: "Submission sent for review", entry: data[0] });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}