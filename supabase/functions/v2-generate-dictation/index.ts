// ============================================================
// TreatNote V2 — AI Dictation Text Generator
// Generates realistic Hungarian dental dictation text via Claude
// POST { complexity: 'simple' | 'medium' | 'complex', category?: string }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const SYSTEM_PROMPT = `Te egy magyar fogorvos vagy, aki hangdiktálás közben mondja el, mit csinált az adott kezelés során.
Írd meg a diktált szöveget olyan stílusban, ahogy egy valódi fogorvos beszélne: természetes, klinikai, de nem túl formális.

SZABÁLYOK:
- CSAK a diktált szöveget írd, semmi mást (nincs bevezető, nincs magyarázat)
- Használj valódi FDI fogszámokat (11-48)
- Említs konkrét anyagokat és márkákat ahol releváns (Nobel, Straumann, Bio-Oss, E-max, cirkón stb.)
- Használj valódi klinikai kifejezéseket (infiltrációs érzéstelenítés, csatornafeltárás, kompozit tömés stb.)
- Legyen természetes, mint egy valódi hangfelvétel — néha "öö", "tehát", "szóval" szavakkal
- A fogszámokat mindig FDI formátumban mondd (pl. "36-os fog", "11-es fog")
- Ha csatornaszámot említesz, legyen specifikus (1-4 csatorna)
- Ha több kezelés van, külön mondatokban említsd őket`;

const COMPLEXITY_PROMPTS: Record<string, string> = {
  simple: `Generálj egy EGYSZERŰ fogorvosi diktálást: 1 kezelés, 1 fog, maximum 2 mondat.
Példák: egyszerű tömés, egy fog húzás, egy érzéstelenítés + tömés.`,
  
  medium: `Generálj egy KÖZEPES fogorvosi diktálást: 2-3 kezelés, 2-3 fog, 3-5 mondat.
Példák: tömés + gyökérkezelés különböző fogakon, több tömés, korona preparáció + lenyomat.`,
  
  complex: `Generálj egy KOMPLEX fogorvosi diktálást: 4-6 kezelés, több fog, 5-8 mondat.
Példák: implantátum + csontpótlás + membrán, több gyökérkezelés különböző csatornaszámmal, teljes ülés fogpótlástani munkával.`,
};

const CATEGORY_HINTS: Record<string, string> = {
  konzervalo: 'Fókuszálj konzerváló fogászatra: tömések (1-3 felszín, kompozit), endodontia (gyökérkezelés, csatornafeltárás, gyökértömés).',
  sebeszet: 'Fókuszálj szájsebészetre: foghúzás (egyszerű és sebészi), socket prezervácio, bölcsességfog eltávolítás.',
  implantacio: 'Fókuszálj implantációra: implantátum beültetés (említs márkát!), csontpótlás anyagokkal, membrán, abutment, gyógyulási sapka.',
  fogpotlastan: 'Fókuszálj fogpótlástanra: korona preparáció (cirkón/E-max/fém-kerámia), lenyomat (digitális/szilikon), ideiglenes korona, híd.',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { complexity = 'medium', category } = await req.json();

    const userPrompt = [
      COMPLEXITY_PROMPTS[complexity] || COMPLEXITY_PROMPTS.medium,
      category && CATEGORY_HINTS[category] ? CATEGORY_HINTS[category] : '',
      'Generáld most a diktálást:',
    ].filter(Boolean).join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text?.trim() || '';

    return new Response(
      JSON.stringify({ text, complexity, category: category || 'random' }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[V2 Generate] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
