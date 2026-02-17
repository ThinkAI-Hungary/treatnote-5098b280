
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://bpjzgapmoyhtgryglcke.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    const email = "zsolt@gmail.com";
    console.log(`Checking user: ${email}`);

    // 1. Resolve User ID via Edge Function (since profiles doesn't have email locally readable usually, or column is missing)
    const { data: userData, error: userError } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'get-user-by-email', email }
    });

    if (userError || !userData?.user?.id) {
        console.error("User Resolution Error:", userError || userData);
        return;
    }

    const userId = userData.user.id;
    console.log("Resolved User ID:", userId);

    // 2. Check Profile current_telephely_id
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("current_telephely_id")
        .eq("user_id", userId)
        .single();

    console.log("Current Profile Telephely ID:", profile?.current_telephely_id);

    // 3. Check Memberships
    const { data: memberships, error: memberError } = await supabase
        .from("telephely_memberships")
        .select("*, telephely(name, company(name))")
        .eq("user_id", userId);

    if (memberError) {
        console.error("Membership Error:", memberError);
    } else {
        console.log("Memberships found:", memberships?.length);
        console.log(JSON.stringify(memberships, null, 2));
    }
}

checkUser();
