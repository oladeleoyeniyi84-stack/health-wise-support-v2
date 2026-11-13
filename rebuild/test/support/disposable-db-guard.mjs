/**
 * Defense-in-depth gate for destructive disposable PostgreSQL integration tests.
 * Does not establish that the server itself is non-production; CI must supply
 * an isolated service container with no production network or credentials.
 */
export function assertDisposableDatabase({url,ack}){
  if(ack!=="YES_DISPOSABLE_DB" || !url) throw new Error("disposable_database_explicit_ack_required");
  let parsed;
  try {parsed=new URL(url);} catch {throw new Error("invalid_database_url");}
  if(!["postgres:","postgresql:"].includes(parsed.protocol)) throw new Error("postgres_url_required");
  if(!["localhost","127.0.0.1","::1"].includes(parsed.hostname)) throw new Error("local_database_only");
  if(parsed.pathname!=="/healthwise_disposable" || parsed.username!=="healthwise_test" || parsed.search || parsed.hash) throw new Error("dedicated_disposable_database_required");
  return url;
}
