import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://bpjzgapmoyhtgryglcke.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw";
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'zsolt@gmail.com',
    password: 'Zsolt123'
  });
  
  if (error) {
    console.error('Login failed:', error.message);
    return;
  }
  
  console.log('Login success. User ID:', data.user.id);
  const token = data.session.access_token;
  
  // Call list-invoices function
  const companyId = 'fdb6b71e-2a01-4434-bf5a-af5a4fdd461b';
  const response = await fetch(`${supabaseUrl}/functions/v1/list-invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ company_id: companyId })
  });
  
  if (!response.ok) {
    console.error('Function call failed:', response.status, await response.text());
    return;
  }
  
  const resData = await response.json();
  console.log('Invoices list:', JSON.stringify(resData, null, 2));
}

main();
