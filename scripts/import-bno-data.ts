// This script parses the BNO codes from the parsed Excel output and imports them via the edge function
// Run with: bun run scripts/import-bno-data.ts

import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://bpjzgapmoyhtgryglcke.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw';

interface BnoCode {
  code: string;
  name: string;
}

// The BNO data from the parsed Excel (markdown table format: |CODE|NAME|)
const rawData = `|A0000|Cholera (Vibrio cholerae 01, cholera biovariáns okozta)|
|A0010|Cholera (Vibrio cholerae 01, El Tor biovariáns okozta)|
|A0090|Cholera k.m.n.|
|A0100|Hastyphus|
|A0110|Paratyphus "A"|
|A0120|Paratyphus "B"|
|A0130|Paratyphus "C"|
|A0140|Paratyphus k.m.n.|
|A0200|Salmonella bélhurut|
|A0210|Salmonella sepsis|
... (parsed from Excel)`;

async function importBatch(codes: BnoCode[]): Promise<{ success: boolean; inserted?: number; error?: string }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-bno-codes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      action: 'import',
      codes,
    }),
  });

  return response.json();
}

async function main() {
  // Read the parsed data file
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: bun run scripts/import-bno-data.ts <path-to-parsed-file>');
    process.exit(1);
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Parse markdown table lines: |CODE|NAME|
  const codes: BnoCode[] = [];
  for (const line of lines) {
    const match = line.match(/^\|([A-Z0-9]{4,6})\|(.+)\|$/);
    if (match) {
      codes.push({
        code: match[1],
        name: match[2].replace(/\\\[/g, '[').replace(/\\\]/g, ']'), // Unescape brackets
      });
    }
  }

  console.log(`Parsed ${codes.length} BNO codes`);

  // Import in batches of 500
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE);
    console.log(`Importing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(codes.length / BATCH_SIZE)}...`);

    const result = await importBatch(batch);
    if (result.success) {
      totalInserted += result.inserted || 0;
      console.log(`  Inserted: ${result.inserted}`);
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log(`\nTotal inserted: ${totalInserted}`);

  // Start embedding generation
  console.log('\nStarting embedding generation...');
  const embeddingResponse = await fetch(`${SUPABASE_URL}/functions/v1/import-bno-codes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action: 'generate-embeddings' }),
  });

  const embeddingResult = await embeddingResponse.json();
  console.log('Embedding generation:', embeddingResult);
}

main().catch(console.error);
