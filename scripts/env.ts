/** A required environment variable for scripts (set it in .env.local or the shell). Never falls back to a literal. */
export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} (see .env.example)`);
  return v;
}
