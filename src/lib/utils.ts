import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Translates raw browser MediaDevices / microphone error messages to Hungarian.
 * Catches the most common English strings thrown by Chrome, Firefox, Safari.
 */
export function translateRecordingError(error: Error | unknown): string {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (msg.includes('permission dismissed') || msg.includes('permission denied') ||
      msg.includes('notallowederror') || msg.includes('permissiondeniederr')) {
    return 'Mikrofon hozzáférés megtagadva. Engedélyezze a böngészőben.';
  }
  if (msg.includes('notfounderror') || msg.includes('devicesnotfounderror') ||
      msg.includes('not found')) {
    return 'Nem található mikrofon az eszközön.';
  }
  if (msg.includes('notreadableerror') || msg.includes('trackstarterror') ||
      msg.includes('could not start audio') || msg.includes('failed to allocate')) {
    return 'A mikrofon jelenleg foglalt vagy nem elérhető.';
  }
  if (msg.includes('aborterror') || msg.includes('abort')) {
    return 'A mikrofon indítása megszakítva.';
  }
  if (msg.includes('overconstrainederror')) {
    return 'A hangfelvétel beállításai nem támogatottak ezen az eszközön.';
  }
  if (msg.includes('recording error')) {
    return 'Felvétel közben hiba történt.';
  }
  if (msg.includes('security')) {
    return 'Biztonsági hiba: mikrofon hozzáférés nem engedélyezett.';
  }

  // Fallback: return original for known-Hungarian messages, else wrap in Hungarian context
  return error instanceof Error ? error.message : String(error);
}
