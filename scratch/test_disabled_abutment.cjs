const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTAyODMsImV4cCI6MjA4MDg4NjI4M30.PexOuPBa2qNLcr2B5NvmXMdfYp0aQD7ZdeUy34H7Jjw';

const data = JSON.stringify({
  text: 'Implantacio a 26-os fogra. Felepito fej felhelyezese es implantatum koronaval lezaras.',
  telephelyId: '79d8df9c-1795-4ef3-ba65-157c6635e9dd'
});

const options = {
  method: 'POST',
  hostname: 'bpjzgapmoyhtgryglcke.supabase.co',
  path: '/functions/v2/v2-test-text',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + ANON_KEY,
    'apikey': ANON_KEY,
    'Content-Length': Buffer.byteLength(data)
  }
};

console.log('Sending test request...');
console.log('Text:', JSON.parse(data).text);
console.log('TelephelyId:', JSON.parse(data).telephelyId);
console.log('---');

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(body);
      if (j.debug && j.debug.mapping) {
        console.log('\n=== MAPPING ITEMS ===');
        j.debug.mapping.items.forEach(i => {
          const status = i.szotarKezelesName ? i.szotarKezelesName : 'UNMAPPED';
          console.log(`  ${i.actionSlug} -> ${status}`);
        });
        console.log('\n=== UNMAPPED ACTIONS ===');
        console.log(' ', j.debug.mapping.unmapped.join(', ') || '(none)');
        
        // Check if abutment was mapped
        const abutmentItems = j.debug.mapping.items.filter(i => i.actionSlug === 'abutment');
        const abutmentMapped = abutmentItems.some(i => i.szotarKezelesName);
        
        console.log('\n=== TEST RESULT ===');
        console.log('Abutment items found:', abutmentItems.length);
        if (abutmentItems.length > 0) {
          abutmentItems.forEach(i => console.log('  status:', i.szotarKezelesName || 'UNMAPPED'));
        }
        console.log('Abutment has szotarKezelesName?', abutmentMapped);
        if (!abutmentMapped) {
          console.log('✅ SUCCESS: abutment is correctly disabled/unmapped');
        } else {
          console.log('❌ FAIL: abutment should NOT be mapped (it is disabled)');
        }
      } else if (j.error) {
        console.log('ERROR:', j.error);
        if (j.stack) console.log('Stack:', j.stack);
      } else {
        console.log('Unexpected response:', body.substring(0, 2000));
      }
    } catch (e) {
      console.log('Parse error. Response:', body.substring(0, 2000));
    }
  });
});

req.on('error', e => console.error('Request error:', e));
req.write(data);
req.end();
