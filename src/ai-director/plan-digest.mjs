// A05 shared, deterministic typed-plan digest.
// All object keys are recursively lexically sorted; arrays keep their order.
// Native Rust independently computes the same SHA-256 before reservation.
function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("PLAN_CANONICAL_OBJECT_REQUIRED");
  }
}
function canonical(value, depth=0) {
  if (depth>24) throw new Error("PLAN_CANONICAL_DEPTH_EXCEEDED");
  if (value===null || typeof value==="string" || typeof value==="boolean") return value;
  if (typeof value==="number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) && Math.abs(value)>9e15)
      throw new Error("PLAN_CANONICAL_NUMBER_INVALID");
    return value;
  }
  if (Array.isArray(value)) {
    if(value.length>256)throw new Error("PLAN_CANONICAL_ARRAY_TOO_LARGE");
    return value.map(item=>canonical(item,depth+1));
  }
  plain(value);
  const keys=Object.keys(value).sort();
  if(keys.length>128)throw new Error("PLAN_CANONICAL_OBJECT_TOO_LARGE");
  const output={};
  for(const key of keys){
    if(["__proto__","prototype","constructor"].includes(key))
      throw new Error("PLAN_CANONICAL_FORBIDDEN_KEY");
    output[key]=canonical(value[key],depth+1);
  }
  return output;
}
export function canonicalJson(value){
  const serialized=JSON.stringify(canonical(value));
  if(serialized.length>48000)throw new Error("PLAN_CANONICAL_TOO_LARGE");
  return serialized;
}
export async function planDigest(value) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
