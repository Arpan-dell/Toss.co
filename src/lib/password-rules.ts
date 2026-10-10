// What a new password must have, wherever one is set (sign-up, change, reset). Shared by the server actions,
// which enforce it, and the live checklist under each new-password field. Signing in with an older password
// that doesn't meet these rules still works; the rules apply when a password is set.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt (Supabase Auth) ignores anything past 72 bytes

export const PASSWORD_RULES = [
  { id: "length", label: `${PASSWORD_MIN} or more characters`, ok: (p: string) => p.length >= PASSWORD_MIN },
  { id: "letter", label: "a letter", ok: (p: string) => /\p{L}/u.test(p) },
  { id: "number", label: "a number", ok: (p: string) => /\p{N}/u.test(p) },
  { id: "special", label: "a special character, like @ # ! _", ok: (p: string) => /[^\p{L}\p{N}\s]/u.test(p) },
] as const;

/** Why this password can't be used, as one sentence for the form; null when it's fine. */
export function passwordError(p: string): string | null {
  if (p.length > PASSWORD_MAX) return `Use a password of at most ${PASSWORD_MAX} characters.`;
  const missing = PASSWORD_RULES.filter((r) => !r.ok(p)).map((r) => r.label);
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Your password needs ${list}.`;
}
