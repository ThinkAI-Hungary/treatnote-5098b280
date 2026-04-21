const fs = require('fs');

const WEBHOOK_URL = "https://bpjzgapmoyhtgryglcke.supabase.co/functions/v1/native-voice-webhook";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw";
const USER_ID = "925386ef-6c42-470c-aec4-8deeb938086e";
const PATIENT_ID = "1062b97b-c035-4641-8812-9cc1ed1aa7ef";

const BATCH_1 = [
  "Mind a négy kvadránsban parodontológiai kürettet végzünk.",
  "A 11-es fogat gyökérkezelni kell, a 12-eset pedig eltávolítani."
];

async function runTests() {
  console.log("Starting test batch 1...");
  
  // Create a dummy audio blob
  const dummyAudio = new Blob(['dummy audio content'], { type: 'audio/webm' });

  for (let i = 0; i < BATCH_1.length; i++) {
    const text = BATCH_1[i];
    console.log(`\n--- Test ${i + 1} ---`);
    console.log(`Input: "${text}"`);
    
    const formData = new FormData();
    formData.append("audio", dummyAudio, "dummy.webm");
    formData.append("mode", "treatnote");
    formData.append("user_id", USER_ID);
    formData.append("treatnote_patient_id", PATIENT_ID);
    formData.append("override_transcript", text);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ANON_KEY}`
        },
        body: formData
      });

      if (!response.ok) {
        console.error(`Error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(errorText);
        continue;
      }

      const data = await response.json();
      console.log(`Job created: ${data.job_id}. Waiting for processing...`);
      
      // Since processing is async in the edge function, we need to poll the database via API
      // Actually, since we bypassed JWT, we can't easily query the database directly from node without service role key.
      // But wait, we can just use the service role key to poll the DB!
    } catch (e) {
      console.error("Fetch error:", e);
    }
  }
}

runTests();
