import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ClickHouseHfService,
  HF_TRIP_RPM_DEFAULT_READ_LIMIT,
} from '@modules/clickhouse/clickhouse-hf.service';
import type { HfTripRpmPointsReadResult } from '@modules/clickhouse/clickhouse-hf.types';
import { PrismaService } from '@shared/database/prisma.service';
import { VsiCapabilityResolverRepository } from '../../vehicle-signal-intelligence/vsi-capability-resolver.repository';
import type {
  VsiActiveRpmProfileResolutionV1,
  VsiRpmCadenceTierResolutionV1,
} from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import { resolveTierEvidenceForTrip } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-evidence.util';
import { resolveIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence-stats.util';
import {
  buildAdmissionForTripIdentityFailure,
  resolveDs4RpmHfV1aAdmission,
  resolveTripRpmProfileFromVsi,
  shouldSkipClickHouseRpmReadForAdmission,
} from './ds4-rpm-hf-v1a-admission';
import type { Ds4RpmHfV1aTripInputV1 } from './ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from './ds4-rpm-hf-v1a.contract';
import { buildDs4RpmHfV1aDataQuality } from './ds4-rpm-hf-v1a-data-quality';
import { readEngineRpmCadenceFromSignalsSnapshot } from './ds4-rpm-hf-v1a-profile.reader';
import { resolveCanonicalTripForRpmHfV1a } from './ds4-rpm-hf-v1a-trip-identity';

export type Ds4RpmHfV1aBuildTripInputParams = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  /** Ignored for ClickHouse scoping — canonical trip times come from VehicleTrip. */
  tripStart?: Date;
  /** Ignored for ClickHouse scoping — canonical trip times come from VehicleTrip. */
  tripEnd?: Date;
  providerSourceLinkId?: string | null;
  fuelType?: string | null;
  readLimit?: number;
  readOffset?: number;
};

@Injectable()
export class Ds4RpmHfV1aTripInputService {
  private readonly logger = new Logger(Ds4RpmHfV1aTripInputService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vsiProfiles: VsiCapabilityResolverRepository,
    @Optional() private readonly clickHouseHf?: ClickHouseHfService,
  ) {}

  /**
   * Builds read-only RPM HF trip input for a future shadow engine (V1A).
   * Does not mutate trips, scores, or DS4 motion outputs.
   */
  async buildTripInput(
    params: Ds4RpmHfV1aBuildTripInputParams,
  ): Promise<Ds4RpmHfV1aTripInputV1> {
    const tripIdentity = await resolveCanonicalTripForRpmHfV1a(this.prisma, {
      organizationId: params.organizationId,
      vehicleId: params.vehicleId,
      tripId: params.tripId,
    });

    const linkId =
      params.providerSourceLinkId ??
      (await this.resolveDimoSourceLinkId(params.vehicleId));

    const fuelType =
      params.fuelType ??
      (
        await this.prisma.vehicle.findFirst({
          where: { id: params.vehicleId, organizationId: params.organizationId },
          select: { fuelType: true },
        })
      )?.fuelType ??
      null;

    const iceRpmApplicability = resolveIceRpmApplicability(fuelType);

    let activeRpmProfileSnapshot: VsiActiveRpmProfileResolutionV1 | null = null;
    let rpmCadenceTierSnapshot: VsiRpmCadenceTierResolutionV1 | null = null;
    let tripRpmProfile = resolveTripRpmProfileFromVsi({
      tripId: params.tripId,
      tripClassifications: [],
    });
    let vehicleActiveRpmProfile: VsiActiveRpmProfileResolutionV1['activeProfile'] | null = null;

    if (linkId) {
      const profileCtx = await this.vsiProfiles.loadProfileContext({
        organizationId: params.organizationId,
        vehicleId: params.vehicleId,
        providerSourceLinkId: linkId,
      });
      if (profileCtx?.signals?.length) {
        const parsed = readEngineRpmCadenceFromSignalsSnapshot(profileCtx.signals);
        activeRpmProfileSnapshot = parsed.activeRpmProfile;
        rpmCadenceTierSnapshot = parsed.rpmCadenceTierResolution;
        vehicleActiveRpmProfile = parsed.activeRpmProfile?.activeProfile ?? null;
        tripRpmProfile = resolveTripRpmProfileFromVsi({
          tripId: params.tripId,
          tripClassifications: parsed.activeRpmProfile?.tripClassifications ?? [],
        });
      }
    }

    if (!tripIdentity.ok) {
      const admission = buildAdmissionForTripIdentityFailure({
        iceRpmApplicability,
        tripRpmProfile,
        vehicleActiveRpmProfile,
        reasonCode: tripIdentity.reasonCode,
        reasonSummary: tripIdentity.reasonSummary,
      });
      return this.buildResult({
        params,
        linkId,
        tripStartIso: null,
        tripEndIso: null,
        admission,
        read: null,
        activeRpmProfileSnapshot,
        rpmCadenceTierSnapshot,
        points: [],
      });
    }

    const canonical = tripIdentity.trip;
    const readLimit = params.readLimit ?? HF_TRIP_RPM_DEFAULT_READ_LIMIT;
    const readOffset = params.readOffset ?? 0;

    let read: HfTripRpmPointsReadResult | null = null;
    const skipCh = shouldSkipClickHouseRpmReadForAdmission({
      iceRpmApplicability,
      tripRpmProfile,
    });

    if (this.clickHouseHf && !skipCh) {
      read = await this.clickHouseHf.getTripRpmHfPoints({
        orgId: canonical.organizationId,
        vehicleId: canonical.vehicleId,
        tripId: canonical.tripId,
        tripStart: canonical.startTime,
        tripEnd: canonical.endTime,
        limit: readLimit,
        offset: readOffset,
      });
    }

    const chReadAvailable =
      read != null &&
      read.status !== 'UNAVAILABLE' &&
      read.status !== 'QUERY_FAILED' &&
      read.status !== 'TENANT_SCOPE_VIOLATION';

    const hfReadComplete =
      read != null &&
      read.status === 'SUCCESS' &&
      read.completenessStatus === 'COMPLETE' &&
      read.offset === 0;

    const hfDataPresent =
      read != null &&
      read.available &&
      read.status === 'SUCCESS' &&
      read.returnedCount > 0;

    const admission = resolveDs4RpmHfV1aAdmission({
      iceRpmApplicability,
      tripId: params.tripId,
      tripRpmProfile,
      vehicleActiveRpmProfile,
      hfDataPresent,
      chReadAvailable: skipCh ? true : chReadAvailable,
      tenantScopeViolation: read?.tenantScopeViolation ?? false,
      hfReadComplete: skipCh ? true : hfReadComplete,
    });

    const points =
      admission.processingAllowed && read?.status === 'SUCCESS' ? read.points : [];

    if (read?.tenantScopeViolation) {
      this.logger.warn(
        JSON.stringify({
          event: 'DS4_RPM_HF_V1A_TENANT_SCOPE_VIOLATION',
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
          tripId: params.tripId,
        }),
      );
    }

    return this.buildResult({
      params,
      linkId,
      tripStartIso: canonical.startTime.toISOString(),
      tripEndIso: canonical.endTime.toISOString(),
      admission,
      read,
      activeRpmProfileSnapshot,
      rpmCadenceTierSnapshot,
      points,
    });
  }

  private buildResult(input: {
    params: Ds4RpmHfV1aBuildTripInputParams;
    linkId: string | null;
    tripStartIso: string | null;
    tripEndIso: string | null;
    admission: Ds4RpmHfV1aTripInputV1['admission'];
    read: HfTripRpmPointsReadResult | null;
    activeRpmProfileSnapshot: VsiActiveRpmProfileResolutionV1 | null;
    rpmCadenceTierSnapshot: VsiRpmCadenceTierResolutionV1 | null;
    points: HfTripRpmPointsReadResult['points'];
  }): Ds4RpmHfV1aTripInputV1 {
    const dataQuality = buildDs4RpmHfV1aDataQuality({
      read: input.read,
      points: input.points,
    });

    const hfReadComplete =
      input.read != null &&
      input.read.status === 'SUCCESS' &&
      input.read.completenessStatus === 'COMPLETE' &&
      input.read.offset === 0;
    const hfDataPresent =
      input.read != null &&
      input.read.available &&
      input.read.status === 'SUCCESS' &&
      input.read.returnedCount > 0;

    const tierEvidence =
      input.tripEndIso != null && input.tripEndIso !== ''
        ? resolveTierEvidenceForTrip({
            tripId: input.params.tripId,
            tripEndIso: input.tripEndIso,
            providerSourceLinkId: input.linkId,
            tierSnapshot: input.rpmCadenceTierSnapshot,
            hfReadComplete,
            hfDataPresent,
          })
        : null;

    return {
      contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
      organizationId: input.params.organizationId,
      vehicleId: input.params.vehicleId,
      tripId: input.params.tripId,
      providerSourceLinkId: input.linkId,
      tripStartIso: input.tripStartIso ?? '',
      tripEndIso: input.tripEndIso ?? '',
      admission: input.admission,
      dataQuality,
      clickHouseRead: {
        status: input.read?.status ?? (input.admission.processingStatus === 'DISABLED_TRIP_IDENTITY' ? 'QUERY_FAILED' : 'UNAVAILABLE'),
        available: input.read?.available ?? false,
        degradedReason: input.read?.degradedReason ?? null,
        tenantScopeViolation: input.read?.tenantScopeViolation ?? false,
      },
      rpmPoints: input.points.map((p) => ({
        recordedAtIso: p.recordedAtIso,
        valueRpm: p.valueRpm,
      })),
      vsiActiveRpmProfileSnapshot: input.activeRpmProfileSnapshot,
      vsiRpmCadenceTierSnapshot: input.rpmCadenceTierSnapshot,
      tierEvidence,
      readOnly: true,
      productionActivationForbidden: true,
    };
  }

  private async resolveDimoSourceLinkId(vehicleId: string): Promise<string | null> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId, isActive: true, provider: 'DIMO' },
      orderBy: { activatedAt: 'desc' },
      select: { id: true },
    });
    return link?.id ?? null;
  }
}
