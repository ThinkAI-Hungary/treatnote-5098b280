
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://bpjzgapmoyhtgryglcke.supabase.co";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseServiceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const updateRole = async () => {
    const email = "asd123@gmail.com";
    console.log(`Looking up user for ${email}...`);

    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        console.error("User not found!");
        return;
    }

    console.log(`Found user: ${user.id}`);

    // Update user_roles table
    console.log("Updating user_roles table...");
    const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: user.id, role: 'klinika_admin' }, { onConflict: 'user_id' });

    if (roleError) {
        console.error("Error updating role:", roleError);
    } else {
        console.log("Role update successful!");
    }
};

updateRole();
