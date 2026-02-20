// MERGE NODE (kód2) - Explicit Content Recovery v4.2
// This version is "stubborn" about finding the MEGJEGYZES_FO content.

const inputs = $input.all();
const comprehensiveData = {};
let globalComment = "";

console.log(`Merge Node: Analyzing ${inputs.length} inputs...`);

inputs.forEach((input, index) => {
    const data = input.json || {};

    // 1. MANDATORY CHECK: Look for the specific 'section': 'MEGJEGYZES_FO' pattern
    if (data.section === "MEGJEGYZES_FO" && data.content) {
        console.log(`Input ${index}: Matched MEGJEGYZES_FO section!`);
        let text = data.content.trim();
        // Strip the "Megjegyzes_fo:\n" label and trailing "---" the AI adds
        text = text.replace(/^Megjegyzes_fo:\s*/i, "").replace(/\s*---\s*$/, "").trim();
        globalComment = globalComment ? `${globalComment}\n${text}` : text;
    }

    // 2. BACKUP CHECK: Search for 'content' or 'megjegyzes_fo' in raw data
    const searchIn = (obj) => {
        if (!obj || typeof obj !== 'object') return;

        for (const [key, value] of Object.entries(obj)) {
            const lowKey = key.toLowerCase();

            // If we find clinical megjegyzes keys
            if (['megjegyzes_fo', 'megjegyzés_fo', 'megjegyzes_fo_'].includes(lowKey)) {
                if (value && typeof value === 'string' && value.trim()) {
                    globalComment = globalComment ? `${globalComment}\n${value.trim()}` : value.trim();
                }
            }

            // Tooth Data (2-digits)
            if (/^\d{2}$/.test(key) && value && typeof value === 'object') {
                const hasRealData = Object.keys(value).some(k => k !== "Megjegyzes" && value[k] !== "" && value[k] !== false);
                if (!comprehensiveData[key]) {
                    comprehensiveData[key] = value;
                } else if (hasRealData) {
                    comprehensiveData[key] = { ...comprehensiveData[key], ...value };
                }
            }
        }
    };

    searchIn(data);
    if (data.body) searchIn(data.body);
});

// Final Check: Reach out to "AI Agent 2" if still empty
if (!globalComment) {
    try {
        const agent = $items("AI Agent 2")[0].json;
        const text = agent.output || agent.content || "";
        const match = text.match(/## Megjegyzes_fo:\s*([\s\S]*?)(?:\s*--- END ---|$)/i);
        globalComment = match ? match[1].trim() : (text.includes("---") ? text.trim() : "");
    } catch (e) { }
}

// Ensure the key exists in the final object
comprehensiveData.MEGJEGYZES_FO = globalComment || "";

// Add Metadata from Webhook
try {
    const web = $items("Webhook")[0].json;
    const b = web.body || web;
    comprehensiveData.metadata = {
        domain: b.flexi_domain || b.domain,
        paciensId: b.PaciensID,
        email: b.flexi_username || b.flexi_email,
        password: b.flexi_pw || b.flexi_password
    };
} catch (e) { }

return [{ json: comprehensiveData }];
