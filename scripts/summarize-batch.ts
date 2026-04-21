import * as fs from "fs";

const data = JSON.parse(fs.readFileSync("batch_results.json", "utf8"));
let output = "";

data.reverse().forEach((r: any, i: number) => {
    output += `\n--- Case ${i+1}\n`;
    output += `Trans: ${r.raw_audio_text}\n`;
    if (!r.result) {
        output += `  No result found\n`;
        return;
    }
    Object.keys(r.result).forEach(k => {
        if (k === 'Megjegyzes_fo') return;
        const tooth = r.result[k];
        const active = tooth?.active_properties || [];
        const megj = tooth?.Megjegyzes || "";
        if (active.length > 0 || megj) {
            output += `  Fog ${k}: ${JSON.stringify(active)} (${megj})\n`;
        }
    });
});

fs.writeFileSync("batch_summary.txt", output);
console.log("Summary saved to batch_summary.txt");
