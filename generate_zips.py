import json
with open(r'C:\Users\Zombo\.gemini\antigravity\brain\85f282bd-903d-47cc-9542-97bc1409b1d3\.system_generated\steps\447\content.md', encoding='utf-8') as f:
    lines = f.read().split('\n')
data = json.loads('\n'.join(lines[4:]))

zip_to_city = {}
city_to_zip = {}

for entry in data:
    z = str(entry['zip'])
    c = entry['city']
    if z.startswith('1') and len(z) == 4:
        continue
    if z not in zip_to_city:
        zip_to_city[z] = c
    if c not in city_to_zip or int(z) < int(city_to_zip[c]):
        city_to_zip[c] = z

city_to_zip['Budapest'] = '1000'

bp_districts = [
  ("1011", "Budapest I. kerület (Budavár)"),
  ("1021", "Budapest II. kerület"),
  ("1036", "Budapest III. kerület (Óbuda)"),
  ("1041", "Budapest IV. kerület (Újpest)"),
  ("1051", "Budapest V. kerület (Belváros)"),
  ("1061", "Budapest VI. kerület (Terézváros)"),
  ("1071", "Budapest VII. kerület (Erzsébetváros)"),
  ("1081", "Budapest VIII. kerület (Józsefváros)"),
  ("1091", "Budapest IX. kerület (Ferencváros)"),
  ("1101", "Budapest X. kerület (Kőbánya)"),
  ("1111", "Budapest XI. kerület (Újbuda)"),
  ("1121", "Budapest XII. kerület (Hegyvidék)"),
  ("1131", "Budapest XIII. kerület (Angyalföld)"),
  ("1141", "Budapest XIV. kerület (Zugló)"),
  ("1151", "Budapest XV. kerület (Rákospalota)"),
  ("1161", "Budapest XVI. kerület (Mátyásföld)"),
  ("1171", "Budapest XVII. kerület (Rákosmente)"),
  ("1181", "Budapest XVIII. kerület (Pestszentlőrinc)"),
  ("1191", "Budapest XIX. kerület (Kispest)"),
  ("1201", "Budapest XX. kerület (Pesterzsébet)"),
  ("1211", "Budapest XXI. kerület (Csepel)"),
  ("1221", "Budapest XXII. kerület (Budafok-Tétény)"),
  ("1231", "Budapest XXIII. kerület (Soroksár)")
]
for z, c in bp_districts:
    city_to_zip[c] = z

ts = []
ts.append('export const ZIP_TO_CITY: Record<string, string> = ' + json.dumps(zip_to_city, ensure_ascii=False, indent=2) + ';')
ts.append('export const CITY_TO_ZIP: Record<string, string> = ' + json.dumps(city_to_zip, ensure_ascii=False, indent=2) + ';')
ts.append('export const CITIES = Object.keys(CITY_TO_ZIP).sort((a,b) => a.localeCompare(b, "hu"));')
ts.append('const romanMap = ["", "I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.", "IX.", "X.", "XI.", "XII.", "XIII.", "XIV.", "XV.", "XVI.", "XVII.", "XVIII.", "XIX.", "XX.", "XXI.", "XXII.", "XXIII."];')
ts.append('const bpDistricts: Record<number, string> = { 1: "Budavár", 3: "Óbuda", 4: "Újpest", 5: "Belváros", 6: "Terézváros", 7: "Erzsébetváros", 8: "Józsefváros", 9: "Ferencváros", 10: "Kőbánya", 11: "Újbuda", 12: "Hegyvidék", 13: "Angyalföld", 14: "Zugló", 15: "Rákospalota", 16: "Mátyásföld", 17: "Rákosmente", 18: "Pestszentlőrinc", 19: "Kispest", 20: "Pesterzsébet", 21: "Csepel", 22: "Budafok-Tétény", 23: "Soroksár" };')
ts.append('export function getCityByZip(zip: string): string | null {')
ts.append('  if (!zip || zip.length !== 4) return null;')
ts.append('  if (zip.startsWith("1")) {')
ts.append('    const districtNum = parseInt(zip.substring(1, 3), 10);')
ts.append('    if (districtNum >= 1 && districtNum <= 23) {')
ts.append('      const name = bpDistricts[districtNum];')
ts.append('      return name ? `Budapest ${romanMap[districtNum]} kerület (${name})` : `Budapest ${romanMap[districtNum]} kerület`;')
ts.append('    }')
ts.append('    return "Budapest";')
ts.append('  }')
ts.append('  return ZIP_TO_CITY[zip] || null;')
ts.append('}')
ts.append('export function getZipByCity(city: string): string | null {')
ts.append('  if (!city) return null;')
ts.append('  return CITY_TO_ZIP[city] || (city.toLowerCase().startsWith("budapest") ? "1000" : null);')
ts.append('}')

with open(r'c:\Users\Zombo\Desktop\Antigrav\TreatNote\treatnote\src\lib\zipcodes.ts', 'w', encoding='utf-8') as f:
    f.write('\n'.join(ts))
