/**
 * Healthwise Engineering Vault: non-sensitive external infrastructure inventory.
 * Structural validation only: accepting a record never proves ownership or
 * recovery, never changes release readiness, and never contacts a provider.
 *
 * Do not store customer records, connection strings, API keys, account emails,
 * backup contents, healthcare information, or screenshot extracts here.
 */
const PROVIDERS=new Set(["render","replit","vercel","neon","supabase",
 "digitalocean","codemagic","stripe","other"]);
const KINDS=new Set(["web-service","database","identity","object-storage",
 "payment-test-account","mobile-ci","other"]);
const ENVS=new Set(["unknown","development","test","staging","production"]);
const DATA=new Set(["unknown","present","none-reported"]);
const BACKUP=new Set(["unknown","configured-unverified","none-reported"]);
const REQUIRED=["provider","resourceKind","resourceId","environment",
 "ownerEvidence","historicalData","backupEvidence"];
const ALLOWED=new Set(REQUIRED);
const RESOURCE=/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/;

export function validateProviderInventoryRecord(input){
 if(!input || typeof input!=="object" || Array.isArray(input))
  throw new Error("inventory_record_object_required");
 if(Object.keys(input).some(key=>!ALLOWED.has(key)) ||
    REQUIRED.some(key=>!Object.hasOwn(input,key)))
  throw new Error("inventory_record_fields_not_allowed");
 const {provider,resourceKind,resourceId,environment,ownerEvidence,
  historicalData,backupEvidence}=input;
 if(!PROVIDERS.has(provider) || !KINDS.has(resourceKind) ||
    !ENVS.has(environment) || !DATA.has(historicalData) ||
    !BACKUP.has(backupEvidence) ||
    !["unverified","connected-account-listed","owner-dashboard-reviewed"].includes(ownerEvidence) ||
    typeof resourceId!=="string" || !RESOURCE.test(resourceId))
  throw new Error("inventory_record_value_invalid");
 // resourceId is a provider-generated identifier only, never a full
 // endpoint, credential, secret, connection string, email or customer ID.
 if(/(?:secret|token|password|api[-_]?key|sk_test|sk_live|bearer)/i.test(resourceId) ||
    resourceId.includes("@"))
  throw new Error("inventory_record_sensitive_identifier");
 return Object.freeze({
  provider,resourceKind,resourceId,environment,ownerEvidence,
  historicalData,backupEvidence,
  // Deliberately never promote source metadata to release evidence.
  productionOwnershipVerified:false,
  recoveryVerified:false,
  safeToMigrate:false,
  safeToPublish:false
 });
}

export function inspectProviderInventory(records){
 if(!Array.isArray(records) || records.length>50)
  throw new Error("inventory_list_invalid");
 const seen=new Set();
 const sanitized=records.map(record=>{
  const value=validateProviderInventoryRecord(record);
  const identity=value.provider+":"+value.resourceKind+":"+value.resourceId;
  if(seen.has(identity))throw new Error("inventory_duplicate_resource");
  seen.add(identity);
  return value;
 });
 return Object.freeze({
  decision:"NO_GO",
  releaseAuthorized:false,
  historicalSourceOfTruthVerified:false,
  records:Object.freeze(sanitized)
 });
}
