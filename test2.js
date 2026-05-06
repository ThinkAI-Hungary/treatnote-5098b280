const url = '"https://bpjzgapmoyhtgryglcke.supabase.co"/rest/v1/rule_items?name=eq.3%20dimenzi%C3%B3s%20tit%C3%A1nh%C3%A1l%C3%B3&select=visit_id';
fetch(url, {
  headers: {
    'apikey': '',
    'Authorization': 'Bearer '
  }
}).then(r => r.json()).then(console.log).catch(console.error);