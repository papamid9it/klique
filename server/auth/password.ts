import bcrypt from "bcryptjs";

const COST = 11;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

let dummy: Promise<string> | null = null;
/**
 * Compared against when the email is unknown, so login takes the same time
 * whether or not an account exists (no account enumeration by timing).
 */
export const dummyHash = () => (dummy ??= bcrypt.hash("scene-timing-equaliser", COST));
