const SUPABASE_URL = 'https://bpjzgapmoyhtgryglcke.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/klinika-admin`;

async function inspectUser(email) {
    // console.log(`Inspecting ${email}...`);
    try {
        const response = await fetch(FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ANON_KEY}`
            },
            body: JSON.stringify({
                operation: "debug-inspect-invite",
                email: email,
                secret: "super-secret-fix-key-123"
            })
        });

        const data = await response.json();
        return data;
    } catch (err) {
        console.error(`Error inspecting ${email}:`, err);
    }
}

async function run() {
    const adminResponse = await inspectUser('klinikaadmin@probaceg.com');
    const userResponse = await inspectUser('asd1234@gmail.com');

    if (adminResponse && userResponse) {
        const adminData = adminResponse.userData;
        const userData = userResponse.userData;

        if (!adminData || !userData) {
            console.log("Failed to retrieve data.");
            return;
        }

        const adminProfile = adminData.profile || {};
        const userProfile = userData.profile || {};

        const adminContext = adminProfile.current_telephely_id || adminProfile.telephely_id;
        const userContext = userProfile.current_telephely_id || userProfile.telephely_id;

        console.log("\n--- Context Mismatch Analysis ---");
        console.log(`Admin Active Context (Where update happened): ${adminContext}`);
        console.log(`User Active Context (Where they are logged in): ${userContext}`);

        if (adminContext !== userContext) {
            console.log("⚠️  MISMATCH DETECTED!");
            console.log("The user is currently 'logged in' to a DIFFERENT clinic than the one where they were made Admin.");
        } else {
            console.log("✅ Contexts match.");
        }

        console.log("\n--- User Memberships ---");
        userData.memberships?.forEach(m => {
            const isContext = m.telephely_id === userContext;
            const isAdminContext = m.telephely_id === adminContext;
            let note = "";
            if (isContext) note += " [ACTIVE USER CONTEXT]";
            if (isAdminContext) note += " [UPDATED ADMIN CONTEXT]";

            console.log(`- Telephely: ${m.telephely_id} | Role: ${m.role}${note}`);
        });

    }
}

run();
