import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://bpjzgapmoyhtgryglcke.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw";
const supabase = createClient(supabaseUrl, supabaseKey);

async function tryLogin(email, pwd) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: pwd
  });
  console.log(`Email: ${email}, Password "${pwd}": ${error ? error.message : 'SUCCESS'}`);
}

async function main() {
  await tryLogin('zsolt@gmail.com', 'asd asd');
  await tryLogin('zsolt@gmail.com', 'asdasd');
  await tryLogin('zsolt@gmail.com', 'asd asd ');
  await tryLogin('zsolt@gmail.com', 'asd 123');
}

main();
