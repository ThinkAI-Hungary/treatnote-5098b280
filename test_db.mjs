import { createClient } from '@supabase/supabase-js';

const supabaseUrl = '"https://bpjzgapmoyhtgryglcke.supabase.co"';
const supabaseKey = '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Checking rule_items for name '1'");
  const { data: items, error: err1 } = await supabase.from('rule_items').select('*').eq('name', '1');
  console.log('items:', items);
  if(err1) console.error('err1:', err1);

  if (items && items.length > 0) {
    const visitIds = items.map(ri => ri.visit_id);
    const { data: visits, error: err2 } = await supabase.from('rule_visits').select('*').in('id', visitIds);
    console.log('visits:', visits);
    if(err2) console.error('err2:', err2);

    if (visits && visits.length > 0) {
      const ruleIds = visits.map(v => v.rule_id);
      const { data: rules, error: err3 } = await supabase.from('treatment_rules').select('*').in('id', ruleIds);
      console.log('rules:', rules);
      if(err3) console.error('err3:', err3);
    }
  }
}
test();