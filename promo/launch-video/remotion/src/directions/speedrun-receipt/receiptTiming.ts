// Shared receipt timing so the tear SFX (Sfx.tsx) lands on the tear visual (Receipt.tsx).
import { TL } from "./timer";
export const TEAR_LOCAL = 84; // local frame the receipt tears free
export const TEAR_GLOBAL = TL.receipt.from + TEAR_LOCAL;
