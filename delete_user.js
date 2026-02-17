
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bpjzgapmoyhtgryglcke.supabase.co';
const serviceRoleKey = '611fa103b0b978ef22fd3259f3021a2e5a80b594977364c819b74fb45d5e24fb';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const email = 'zombori.mark@gmail.com';

async function deleteUser() {
    console.log(`Looking up user ${email}...`);
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error('Error listing users:', listError);
        return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
        console.log('User not found.');
        return;
    }

    console.log(`Found user ${user.id}. Deleting...`);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
        console.error('Error deleting user:', deleteError);
    } else {
        console.log('User successfully deleted.');
    }
}

deleteUser();
