/**
 * Off-repo owner signing helper — reads private key from FSD3_OWNER_L2_SIGNING_KEY_PEM_FILE only.
 * Never commit private keys.
 */
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
  type Fsd3LiveOwnerApprovalSignablePayloadV1,
} from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-owner-approval.v1';
import { buildFsd3OwnerApprovalSigningDigestV1 } from '../../src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-owner-approval.crypto.v1';

function parseArgs() {
  const get = (prefix: string) =>
    process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  return {
    keyId: get('--key-id='),
    keyFile: get('--signing-key-pem-file=') ?? process.env.FSD3_OWNER_L2_SIGNING_KEY_PEM_FILE,
    payloadFile: get('--payload-json-file='),
  };
}

function main(): void {
  const args = parseArgs();
  if (!args.keyId?.trim() || !args.keyFile?.trim() || !args.payloadFile?.trim()) {
    console.error('Usage: --key-id= --signing-key-pem-file= --payload-json-file=');
    process.exit(2);
  }
  const pem = readFileSync(args.keyFile, 'utf8');
  const privateKey = createPrivateKey(pem);
  const rawPayload = JSON.parse(readFileSync(args.payloadFile, 'utf8')) as Fsd3LiveOwnerApprovalSignablePayloadV1;
  if (rawPayload.schemaVersion !== FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1) {
    throw new Error('FSD3_L2_APPROVAL_SCHEMA_INVALID');
  }
  const digest = buildFsd3OwnerApprovalSigningDigestV1(rawPayload);
  const detached = sign(null, digest, privateKey).toString('base64');
  const envelope = {
    payload: rawPayload,
    signature: { algorithm: 'Ed25519' as const, keyId: args.keyId, detachedBase64: detached },
  };
  console.log(JSON.stringify(envelope, null, 2));
}

main();
