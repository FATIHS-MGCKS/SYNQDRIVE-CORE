# DS4 Layer-2 P3 — Motion Physics context resolver (research)

**Status:** Research-only (offline diagnostics). Not wired to production motion-core, assessment workers, admission, or eligibility.

**Schema:** `DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_V1`  
**Resolver:** `DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_V1`

## Purpose

Provide a typed, versioned read-only snapshot of the active `VehicleMotionPhysicsReference` row for a tenant-scoped vehicle, with explicit applicability and limitation reasons for future Layer-2 offline physics diagnostics. Values are taken from the active reference row only (no AI spec fallback, no `vehicles.curb_weight_kg` promotion).

## Entry points

| Symbol | Path |
|--------|------|
| `resolveDs4Layer2MotionPhysicsContextV1` | `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p3-motion-physics-context.resolver.v1.ts` |
| Contract types | `.../ds4-layer2-p3-motion-physics-context.v1.contract.ts` |
| Prisma factory (read-only) | `createDs4Layer2MotionPhysicsContextResolverDepsFromPrisma` |

## Applicability (research)

| Value | Meaning |
|-------|---------|
| `AVAILABLE_VERIFIED` | Tier `VERIFIED` **and** `verifiedAt`, `verifiedByUserId`, `documentExtractionId` all present |
| `AVAILABLE_CONFIRMED_UNVERIFIED` | Tier `CONFIRMED` |
| `ESTIMATED_ONLY` | Tier `ESTIMATED` |
| `MISSING` | No active reference for vehicle |
| `IDENTITY_MISMATCH` | Fingerprint incompatible with vehicle identity |
| `AMBIGUOUS` | Inactive/superseded row, effective window, malformed fingerprint, or VERIFIED without evidence |
| `NOT_ELIGIBLE` | Vehicle not found or org/vehicle binding failed |

## Identity and evidence gates

- Organization-scoped vehicle load; exact `vehicleId` UUID.
- Active reference via `VehicleMotionPhysicsReferenceRepository.findActiveForVehicle`.
- `evaluateIdentityAgainstVehicle` + VIN hash when both sides have VIN evidence.
- Fail-closed on integrity (`isActive`, `supersededById`) and `asOfUtc` vs `effectiveFrom` / `effectiveTo`.
- `ENGINE_RATED_POWER_NOT_SYSTEM_POWER` when definition is engine/motor-rated OEM kW (no automatic promotion to system power).

## Integration boundary

**Do not import** the resolver from motion-core shadow processor, C5.1 repair, DS4 assessment worker, event admission, Driving Impact, Tire Intelligence, or Brake Health.

## Tests

`backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/__tests__/ds4-layer2-p3-motion-physics-context.resolver.v1.spec.ts` — fixture/mocked deps only.

## Change record

- 2026-10-31: Initial P3B resolver + contract (isolated research implementation).
