import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const maxDuration = 60;

export async function GET() {
  try {
    // CRITICAL FIX: Only fetch fires that have been approved by you
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .eq('status', 'approved') 
      .order('date_added', { ascending: false });

    if (error) throw error;
    return Response.json({ incidents: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { admin_password, action, id, ...fireData } = body;

  // 1. ADMIN MODERATION (Approve/Delete)
  if (action === 'moderate') {
    if (admin_password !== process.env.ADMIN_SECRET_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (fireData.status === 'deleted') {
      await supabaseAdmin.from('incidents').delete().eq('id', id);
      return Response.json({ message: "Deleted" });
    } else {
      await supabaseAdmin.from('incidents').update({ status: fireData.status }).eq('id', id);
      return Response.json({ message: "Approved" });
    }
  }

  // 2. ADMIN DIRECT ADD (Bypasses queue)
  if (admin_password === process.env.ADMIN_SECRET_PASSWORD) {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert([{ ...fireData, status: 'approved' }])
      .select();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ message: "Admin entry added", entry: data[0] });
  }

  // 3. PUBLIC SUBMISSION (Strictly Pending)
  // We manually pick fields to ensure 'status' cannot be injected by a user
  const submission = {
    title: fireData.title,
    location: fireData.location,
    facility_type: fireData.facility_type,
    url: fireData.url,
    date_occurred: fireData.date_occurred,
    status: 'pending' // Hardcoded: Cannot be changed by public request
  };

  const { data, error } = await supabaseAdmin
    .from('incidents')
    .insert([submission])
    .select();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ message: "Sent for review" });
}