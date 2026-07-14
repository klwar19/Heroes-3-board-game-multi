#!/usr/bin/env node
/**
 * Set the CORS policy on the Cloudflare R2 bucket behind the CDN domain
 * (docs/cloudflare-custom-domain-cdn-plan.md). Needed for the ONE asset class
 * the browser fetches in CORS mode: web fonts (@font-face) — and it also
 * future-proofs any fetch()/XHR of a CDN object. <img>, CSS backgrounds and
 * HTMLAudioElement are no-cors and work without this.
 *
 * Dependency-free: talks to R2's S3 API (GetBucketCors/PutBucketCors) with a
 * hand-rolled SigV4 signature via node:crypto. Idempotent — if the live policy
 * already matches, nothing is written (safe to run on every CI sync).
 *
 * Required env (same token the sync script uses):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Optional env:
 *   R2_BUCKET            bucket name (default: heroes3)
 *   R2_CORS_ORIGINS      comma-separated origin overrides (default: the app
 *                        origins below — apex, www, *.vercel.app previews,
 *                        localhost dev)
 *
 * Usage:
 *   npm run setup:r2-cors            # apply (no-op when already matching)
 *   npm run setup:r2-cors -- --dry-run
 */
import { createHash, createHmac } from "node:crypto";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || "heroes3";
const DRY_RUN = process.argv.includes("--dry-run");

for (const [name, value] of Object.entries({
  R2_ACCOUNT_ID: ACCOUNT_ID,
  R2_ACCESS_KEY_ID: ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY
})) {
  if (!value) {
    console.error(`error: ${name} is not set (see the header of this script)`);
    process.exit(1);
  }
}

const DEFAULT_ORIGINS = [
  "https://hamthefirt.xyz",
  "https://www.hamthefirt.xyz",
  // Every Vercel deployment of the app: production alias + preview URLs.
  "https://*.vercel.app",
  // Local dev pointing NEXT_PUBLIC_ASSET_BASE_URL at the CDN for testing.
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const origins = (process.env.R2_CORS_ORIGINS || DEFAULT_ORIGINS.join(","))
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const MAX_AGE_SECONDS = 86400;

const corsXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<CORSConfiguration>",
  "  <CORSRule>",
  ...origins.map((o) => `    <AllowedOrigin>${o}</AllowedOrigin>`),
  "    <AllowedMethod>GET</AllowedMethod>",
  "    <AllowedMethod>HEAD</AllowedMethod>",
  "    <AllowedHeader>*</AllowedHeader>",
  `    <MaxAgeSeconds>${MAX_AGE_SECONDS}</MaxAgeSeconds>`,
  "  </CORSRule>",
  "</CORSConfiguration>",
  ""
].join("\n");

const HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const sha256hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** Minimal SigV4 for path-style S3 requests with a `cors` subresource. */
function signedHeaders(method, body) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const headers = {
    host: HOST,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(method === "PUT"
      ? { "content-md5": createHash("md5").update(body).digest("base64") }
      : {})
  };
  const headerNames = Object.keys(headers).sort();
  const canonicalHeaders = headerNames.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaderList = headerNames.join(";");

  const canonicalRequest = [
    method,
    `/${BUCKET}`,
    "cors=", // the ?cors subresource, canonically encoded
    canonicalHeaders,
    signedHeaderList,
    payloadHash
  ].join("\n");

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256hex(canonicalRequest)
  ].join("\n");

  const kDate = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${scope}, ` +
      `SignedHeaders=${signedHeaderList}, Signature=${signature}`
  };
}

async function corsRequest(method, body = "") {
  const response = await fetch(`https://${HOST}/${BUCKET}?cors`, {
    method,
    headers: signedHeaders(method, body),
    body: method === "PUT" ? body : undefined
  });
  const text = await response.text();
  return { status: response.status, text };
}

function originsInXml(xml) {
  return [...xml.matchAll(/<AllowedOrigin>([^<]*)<\/AllowedOrigin>/g)]
    .map((m) => m[1].trim())
    .sort();
}

const current = await corsRequest("GET");
if (current.status === 200) {
  console.log(`Current CORS origins on ${BUCKET}: ${originsInXml(current.text).join(", ") || "(none)"}`);
} else if (current.text.includes("NoSuchCORSConfiguration") || current.status === 404) {
  console.log(`Bucket ${BUCKET} has no CORS configuration yet.`);
} else {
  console.error(`error: GetBucketCors failed (${current.status}): ${current.text.slice(0, 300)}`);
  process.exit(1);
}

const desired = origins.slice().sort();
if (current.status === 200 && JSON.stringify(originsInXml(current.text)) === JSON.stringify(desired)) {
  console.log("CORS policy already up to date — nothing to write.");
  process.exit(0);
}

console.log(`${DRY_RUN ? "[dry-run] Would apply" : "Applying"} CORS policy (GET/HEAD, max-age ${MAX_AGE_SECONDS}s) for:`);
for (const o of origins) console.log(`  - ${o}`);
if (DRY_RUN) process.exit(0);

const put = await corsRequest("PUT", corsXml);
if (put.status !== 200) {
  console.error(`error: PutBucketCors failed (${put.status}): ${put.text.slice(0, 300)}`);
  process.exit(1);
}

const verify = await corsRequest("GET");
if (verify.status !== 200 || JSON.stringify(originsInXml(verify.text)) !== JSON.stringify(desired)) {
  console.error("error: CORS write did not verify — inspect the bucket in the Cloudflare dashboard.");
  process.exit(1);
}
console.log("CORS policy applied and verified.");
console.log("Browser check (after fonts are synced):");
console.log(
  "  curl -sI -H 'Origin: https://hamthefirt.xyz' https://cdn.hamthefirt.xyz/fonts/LiberationSerif-Regular.ttf | grep -i access-control"
);
