import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Returns null when OK, or a pt-BR error message. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "A senha deve ter pelo menos 10 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "A senha deve conter letras maiúsculas e minúsculas.";
  }
  if (!/[0-9]/.test(password)) return "A senha deve conter pelo menos um número.";
  return null;
}
