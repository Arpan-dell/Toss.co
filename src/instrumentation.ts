// Runs once when a server instance starts, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkEnv } = await import("./lib/env-check");
    checkEnv();
  }
}
