export function isVoxisJob(mode: string | undefined | null, result: any): boolean {
  if (mode === 'voxis') return true;
  
  if (result) {
     let payload = result;
     
     if (typeof payload === 'string') {
       try {
         payload = JSON.parse(payload);
       } catch(e) {
         return false; // not parsable JSON
       }
     }
     
     if (typeof payload === 'object' && payload !== null) {
       if ('payload' in payload) {
         payload = payload.payload;
       }
       
       if (!payload || typeof payload !== 'object') return false;

       const keys = Object.keys(payload);
       if (keys.length > 0 && keys.some(k => !isNaN(parseInt(k)) && parseInt(k) >= 11 && parseInt(k) <= 85)) {
         return true;
       }
       if ('Megjegyzes_fo' in payload || 'MEGJEGYZES_FO' in payload) return true;
     }
  }
  
  return false;
}
