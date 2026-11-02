import type { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import type { HfTripRpmPointsReadResult } from '@modules/clickhouse/clickhouse-hf.types';
import type { PrismaService } from '@shared/database/prisma.service';
import type { VsiCapabilityResolverRepository } from '../../../vehicle-signal-intelligence/vsi-capability-resolver.repository';
import { Ds4RpmHfV1aTripInputService } from '../ds4-rpm-hf-v1a-trip-input.service';

describe('Ds4RpmHfV1aTripInputService', () => {
  const tripStart = new Date('2026-10-27T10:00:00.000Z');
  const tripEnd = new Date('2026-10-27T10:30:00.000Z');

  function makeService(deps: {
    ch?: Partial<ClickHouseHfService>;
    profile?: { signals: unknown } | null;
    fuelType?: string | null;
    tripStatus?: string;
  }) {
    const prisma = {
      vehicle: {
        findFirst: jest.fn(async () => ({ fuelType: deps.fuelType ?? 'GASOLINE' })),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn(async () => ({ id: 'link-1' })),
      },
      vehicleTrip: {
        findFirst: jest.fn(async () => ({
          id: 'trip-1',
          vehicleId: 'veh-1',
          tripStatus: deps.tripStatus ?? 'COMPLETED',
          startTime: tripStart,
          endTime: tripEnd,
          vehicle: { organizationId: 'org-1' },
        })),
      },
    } as unknown as PrismaService;

    const vsiProfiles = {
      loadProfileContext: jest.fn(async () =>
        deps.profile
          ? {
              signals: deps.profile.signals,
              profileContractVersion: 'v2',
              profileRevision: 1,
              contentFingerprint: 'fp',
              profileLimitations: [],
            }
          : null,
      ),
    } as unknown as VsiCapabilityResolverRepository;

    const clickHouseHf = deps.ch as ClickHouseHfService | undefined;

    return {
      svc: new Ds4RpmHfV1aTripInputService(prisma, vsiProfiles, clickHouseHf),
      chMock: deps.ch,
    };
  }

  const rpm1HzProfile = {
    signals: [
      {
        canonicalSignalKey: 'engine_rpm',
        cadenceIntelligence: {
          contractVersion: 'vsi-signal-cadence-v2',
          activeRpmProfile: {
            contractVersion: 'vsi-active-rpm-profile-v1',
            activeProfile: 'RPM_1HZ',
            evaluatedTripIds: ['trip-1'],
            qualifyingTripCount: 1,
            agreementRatio: 1,
            classificationDecisionCode: 'FAST',
            classificationDecisionSummary: 'test',
            tripClassifications: [
              {
                tripId: 'trip-1',
                endMs: tripEnd.getTime(),
                profile: 'RPM_1HZ',
                intervalMedianSeconds: 1,
                intervalP95Seconds: 2,
                intervalCount: 40,
                rpmPointCount: 50,
                fractionIntervalsLe2s: 0.9,
                decisionCode: 'FAST_1_2S_BUCKET_PATTERN',
              },
            ],
            profileSemanticFingerprint: 'abc',
          },
        },
      },
    ],
  };

  it('integrates admission + read for RPM_1HZ trip using canonical trip window', async () => {
    const getTripRpmHfPoints = jest.fn(async (): Promise<HfTripRpmPointsReadResult> => ({
      status: 'SUCCESS',
      available: true,
      orgId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripWindowFromIso: tripStart.toISOString(),
      tripWindowToIso: tripEnd.toISOString(),
      signalName: 'powertrainCombustionEngineSpeed',
      points: [
        {
          recordedAtMs: tripStart.getTime(),
          recordedAtIso: tripStart.toISOString(),
          valueRpm: 1500,
          unit: 'rpm',
          quality: 'normalized',
          orgId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          tokenId: 9001001,
        },
      ],
      totalMatchingCount: 1,
      returnedCount: 1,
      rawRowsReturned: 1,
      limit: 12000,
      offset: 0,
      completenessStatus: 'COMPLETE',
      duplicateTimestampCount: 0,
      invalidValueCount: 0,
      tenantScopeViolation: false,
    }));

    const { svc } = makeService({
      profile: rpm1HzProfile,
      ch: { getTripRpmHfPoints },
    });

    const result = await svc.buildTripInput({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: 'link-1',
    });

    expect(result.admission.processingAllowed).toBe(true);
    expect(result.rpmPoints).toHaveLength(1);
    expect(result.tripStartIso).toBe(tripStart.toISOString());
    expect(getTripRpmHfPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        tripStart,
        tripEnd,
      }),
    );
  });

  it('without ClickHouse on RPM_1HZ → CH unavailable admission', async () => {
    const { svc } = makeService({ profile: rpm1HzProfile, ch: undefined });
    const result = await svc.buildTripInput({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });
    expect(result.admission.processingStatus).toBe('DISABLED_CH_UNAVAILABLE');
    expect(result.rpmPoints).toHaveLength(0);
  });

  it('RPM_STANDARD skips ClickHouse read', async () => {
    const getTripRpmHfPoints = jest.fn();
    const { svc } = makeService({
      profile: {
        signals: [
          {
            canonicalSignalKey: 'engine_rpm',
            cadenceIntelligence: {
              activeRpmProfile: {
                activeProfile: 'RPM_STANDARD',
                tripClassifications: [{ tripId: 'trip-1', profile: 'RPM_STANDARD' }],
              },
            },
          },
        ],
      },
      ch: { getTripRpmHfPoints },
    });
    const result = await svc.buildTripInput({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });
    expect(getTripRpmHfPoints).not.toHaveBeenCalled();
    expect(result.admission.reasonCode).toBe('RPM_STANDARD_PROFILE');
  });

  it('incomplete HF read blocks ENABLED admission', async () => {
    const { svc } = makeService({
      profile: rpm1HzProfile,
      ch: {
        getTripRpmHfPoints: jest.fn(async (): Promise<HfTripRpmPointsReadResult> => ({
          status: 'SUCCESS',
          available: true,
          orgId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          tripWindowFromIso: tripStart.toISOString(),
          tripWindowToIso: tripEnd.toISOString(),
          signalName: 'powertrainCombustionEngineSpeed',
          points: [
            {
              recordedAtMs: tripStart.getTime(),
              recordedAtIso: tripStart.toISOString(),
              valueRpm: 1500,
              unit: 'rpm',
              quality: 'normalized',
              orgId: 'org-1',
              vehicleId: 'veh-1',
              tripId: 'trip-1',
              tokenId: 9001001,
            },
          ],
          totalMatchingCount: 15000,
          returnedCount: 1,
          rawRowsReturned: 12000,
          limit: 12000,
          offset: 0,
          completenessStatus: 'INCOMPLETE_MORE_POINTS_AVAILABLE',
          duplicateTimestampCount: 0,
          invalidValueCount: 0,
          tenantScopeViolation: false,
        })),
      },
    });
    const result = await svc.buildTripInput({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });
    expect(result.admission.processingStatus).toBe('DISABLED_INCOMPLETE_HF_READ');
    expect(result.rpmPoints).toHaveLength(0);
  });

  it('invalid trip identity fail-closed without CH', async () => {
    const getTripRpmHfPoints = jest.fn();
    const { svc } = makeService({
      tripStatus: 'ONGOING',
      profile: rpm1HzProfile,
      ch: { getTripRpmHfPoints },
    });
    const result = await svc.buildTripInput({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    });
    expect(getTripRpmHfPoints).not.toHaveBeenCalled();
    expect(result.admission.processingStatus).toBe('DISABLED_TRIP_IDENTITY');
  });
});
