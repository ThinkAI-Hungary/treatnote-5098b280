import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Inspecting 'klinikaadmin@probaceg.com'...");

    // 1. Get Admin User
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const adminUser = users.find(u => u.email === 'klinikaadmin@probaceg.com');

    if (!adminUser) {
        console.error("Admin user not found!");
        return;
    }

    // 2. Get Admin Profile
    const { data: adminProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', adminUser.id)
        .single();

    console.log("Admin Profile:", {
        id: adminProfile.user_id,
        company_id: adminProfile.company_id,
        telephely_id: adminProfile.telephely_id,
        current_telephely_id: adminProfile.current_telephely_id
    });

    // 3. Get Target User 'asd1234@gmail.com'
    const targetUser = users.find(u => u.email === 'asd1234@gmail.com');
    if (!targetUser) {
        console.error("Target user 'asd1234@gmail.com' not found! Checking partial matches...");
        const partial = users.find(u => u.email && u.email.includes('asd123'));
        if (partial) {
            console.log(`Found partial match: ${partial.email} (${partial.id})`);
        } else {
            console.log("No partial matches found either.");
        }
        return;
    }

    console.log(`Found Target User: ${targetUser.email} (${targetUser.id})`);

    // 4. Get Target Memberships
    const { data: memberships } = await supabase
        .from('telephely_memberships')
        .select('*')
        .eq('user_id', targetUser.id);

    console.log("Target Memberships:", memberships);

    // 5. Check if they are in the SAME telephely as Admin's CURRENT telephely
    const activeTelephelyId = adminProfile.current_telephely_id || adminProfile.telephely_id;
    const match = memberships?.find(m => m.telephely_id === activeTelephelyId);

    if (match) {
        console.log(`✅ MATCH FOUND: User is in Admin's ACTIVE telephely (${activeTelephelyId}).`);
        console.log(`Current Role: ${match.role}`);
    } else {
        console.log(`❌ NO MATCH: User is NOT in Admin's ACTIVE telephely (${activeTelephelyId}).`);
        console.log("This exaplains why update might fail or create new record.");
    }
}

inspect();
