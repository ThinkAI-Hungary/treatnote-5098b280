
const url = 'https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/invitation-handler';
const key = 'c391e488f8f482cdfaf313e2e4a156438329898115d617a026a3f10536399aa8'; // Anon Key
const email = 'zombori.mark@gmail.com';

async function deleteUser() {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ operation: 'delete-user-by-email', email })
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

deleteUser();
