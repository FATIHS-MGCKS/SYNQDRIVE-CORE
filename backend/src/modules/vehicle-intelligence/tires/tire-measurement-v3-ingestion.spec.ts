import { TireEvidenceSource } from '@prisma/client';
import {
  assessV3Ingestion,
  isGroundTruthMeasurementCommand,
  isOdometerExplicitlyConfirmed,
  resolveExplicitMeasurementOdometerKm,
  resolvePersistedMeasurementOdometerKm,
  validateTreadMmValues,
} from './tire-measurement-v3-ingestion';
import type { RecordTireMeasurementCommand } from './tire-lifecycle.service';
import { TireOdometerAnchorStatus } from '@prisma/client';

const mount = {
  id: 'mp-1',
  installedAt: new Date('2026-01-01T00:00:00Z'),
  removedAt: null,
  installedOdometerKm: 1000,
  odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
};

describe('tire-measurement-v3-ingestion', () => {
  it('requires explicit confirm for ground-truth odometer capture', () => {
    const cmd: RecordTireMeasurementCommand = {
      vehicleId: 'v1',
      odometerKm: 5000,
      source: 'manual',
    };
    expect(isOdometerExplicitlyConfirmed(cmd)).toBe(false);
    expect(resolveExplicitMeasurementOdometerKm(cmd)).toBeNull();
    expect(
      resolvePersistedMeasurementOdometerKm({
        groundTruth: true,
        explicitOdometerKm: null,
        inferredOdometerKm: 4800,
      }),
    ).toBeNull();
  });

  it('accepts workshop source as explicit odometer confirmation', () => {
    const cmd: RecordTireMeasurementCommand = {
      vehicleId: 'v1',
      odometerKm: 5000,
      source: 'workshop',
    };
    expect(resolveExplicitMeasurementOdometerKm(cmd)).toBe(5000);
  });

  it('rejects ai_confirmed for ground truth', () => {
    expect(
      isGroundTruthMeasurementCommand(
        'ai_confirmed',
        TireEvidenceSource.USER_CONFIRMED,
      ),
    ).toBe(false);
  });

  it('flags missing explicit odometer for V3 verification', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: null,
      inferredAnchor: {
        odometerKm: 1200,
        source: 'VEHICLE_LATEST_STATE' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 80,
        plausibilityIssue: null,
        clientValueIgnored: true,
      },
      treadValues: {
        frontLeftMm: 7,
        frontRightMm: 7,
        rearLeftMm: 7,
        rearRightMm: 7,
      },
      priorResult: null,
    });
    expect(assessment.verificationEligible).toBe(false);
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_ODOMETER_NOT_EXPLICIT');
  });

  it('allows verification with explicit odometer on partial wheel measurement', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2000,
      inferredAnchor: {
        odometerKm: 2000,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 85,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: {
        frontLeftMm: 6.5,
        frontRightMm: null,
        rearLeftMm: null,
        rearRightMm: null,
      },
      priorResult: {
        rated: true,
        setupFlags: ['RATE_INSUFFICIENT_POINTS'],
        verification: { status: 'CURRENT' },
      } as never,
    });
    expect(assessment.verificationEligible).toBe(true);
    expect(assessment.posteriorCalibrationEligible).toBe(false);
  });

  it('excludes ai_confirmed legacy source from verification assessment', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'ai_confirmed',
      evidenceSource: TireEvidenceSource.USER_CONFIRMED,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2000,
      inferredAnchor: {
        odometerKm: 2000,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 85,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: {
        frontLeftMm: 6,
        frontRightMm: 6,
        rearLeftMm: 6,
        rearRightMm: 6,
      },
      priorResult: null,
    });
    expect(assessment.verificationEligible).toBe(false);
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_VERIFICATION_SOURCE_EXCLUDED');
  });

  it('validates tread bounds', () => {
    expect(
      validateTreadMmValues({
        frontLeftMm: 21,
        frontRightMm: null,
        rearLeftMm: null,
        rearRightMm: null,
      }),
    ).toContain('20');
  });

  it('excludes registration baseline from verification anchors', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual_registration',
      evidenceSource: TireEvidenceSource.DOCUMENT_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: null,
      inferredAnchor: {
        odometerKm: null,
        source: 'UNKNOWN' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 0,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: {
        frontLeftMm: 7,
        frontRightMm: 7,
        rearLeftMm: 7,
        rearRightMm: 7,
      },
      priorResult: null,
    });
    expect(assessment.verificationEligible).toBe(false);
    expect(assessment.evidenceClass).toBe('EXCLUDED_SOURCE');
    expect(assessment.warnings.map((w) => w.code)).toContain(
      'V3_REGISTRATION_BASELINE_NOT_VERIFICATION_ANCHOR',
    );
  });

  it('requires measurement timestamp inside mount period for verificationEligible', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2025-12-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2000,
      inferredAnchor: {
        odometerKm: 2000,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 85,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: { frontLeftMm: 7, frontRightMm: null, rearLeftMm: null, rearRightMm: null },
      priorResult: null,
    });
    expect(assessment.verificationEligible).toBe(false);
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_MEASUREMENT_OUTSIDE_MOUNT_PERIOD');
  });

  it('allows workshop ground truth with explicit odometer as verification eligible', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'workshop',
      evidenceSource: TireEvidenceSource.WORKSHOP_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2500,
      inferredAnchor: {
        odometerKm: 2500,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 90,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: { frontLeftMm: 6.8, frontRightMm: 6.8, rearLeftMm: 6.8, rearRightMm: 6.8 },
      priorResult: { rated: true, setupFlags: ['RATE_INSUFFICIENT_POINTS'], wheels: [] } as never,
      workshopName: 'Reifen Müller',
    });
    expect(assessment.verificationEligible).toBe(true);
    expect(assessment.posteriorCalibrationEligible).toBe(false);
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_VERIFICATION_ANCHOR_ONE_POINT');
  });

  it('does not set posteriorCalibrationEligible from empty setupFlags alone', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2000,
      inferredAnchor: {
        odometerKm: 2000,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 85,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: { frontLeftMm: 6.5, frontRightMm: null, rearLeftMm: null, rearRightMm: null },
      priorResult: {
        rated: true,
        setupFlags: [],
        wheels: [
          {
            position: 'FL',
            wearRate: {
              source: 'measurement_fused',
              measurementUncertaintyMmPerKm: { lo: 0.00001, hi: 0.00002 },
            },
            flags: [],
          },
        ],
      } as never,
    });
    expect(assessment.posteriorCalibrationEligible).toBe(true);
  });

  it('classifies unverified manual ground truth without confirm', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: null,
      inferredAnchor: {
        odometerKm: 1200,
        source: 'VEHICLE_LATEST_STATE' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 80,
        plausibilityIssue: null,
        clientValueIgnored: true,
      },
      treadValues: { frontLeftMm: 7, frontRightMm: null, rearLeftMm: null, rearRightMm: null },
      priorResult: null,
    });
    expect(assessment.evidenceClass).toBe('UNVERIFIED_GROUND_TRUTH');
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_MEASUREMENT_RECORDED_UNVERIFIED');
  });
});
