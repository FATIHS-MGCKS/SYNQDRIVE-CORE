import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { compareOemVinLookupEuSuggestions } from './oneauto-vin-lookup-oem-suggestion.comparison';
import type { OneAutoVinLookupEuSuggestionSnapshot } from './oneauto-vin-lookup-oem-suggestion.types';
import { buildOemCanonicalFieldInputsFromVehicle } from './oneauto-oem-vin-lookup-eu-suggestion-canonical.util';
import {
  assertSafeOemSuggestionListDto,
  type OneAutoOemVinLookupEuSuggestionListDto,
} from './oneauto-oem-vin-lookup-eu-suggestion.dto';

@Injectable()
export class OneAutoOemVinLookupEuSuggestionReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private suggestionsEnabled(): boolean {
    const cfg = this.config.get<{ oemSuggestionsEnabled?: boolean }>('oneautoProvider');
    return cfg?.oemSuggestionsEnabled === true;
  }

  async listForVehicle(orgId: string, vehicleId: string): Promise<OneAutoOemVinLookupEuSuggestionListDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        oemEngineCode: true,
        oemEngineDesc: true,
        oemTransmissionCode: true,
        oemTransmissionDesc: true,
        exteriorColorDesc: true,
        oemExteriorColorCode: true,
        interiorTrimDesc: true,
        oemInteriorTrimCode: true,
        oemModelRangeDesc: true,
        oemDerivativeDesc: true,
        registrationIdentityProvenance: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const featureEnabled = this.suggestionsEnabled();
    if (!featureEnabled) {
      const dto: OneAutoOemVinLookupEuSuggestionListDto = {
        organizationId: orgId,
        vehicleId,
        featureEnabled: false,
        suggestions: [],
      };
      assertSafeOemSuggestionListDto(dto);
      return dto;
    }

    const now = new Date();
    const rows = await this.prisma.oneAutoOemVinLookupEuSuggestionSnapshot.findMany({
      where: {
        organizationId: orgId,
        vehicleId,
        expiresAt: { gt: now },
      },
      orderBy: { snapshotCreatedAt: 'desc' },
    });

    const canonicalByField = buildOemCanonicalFieldInputsFromVehicle(vehicle);

    const suggestions = rows.map((row) => {
      const snapshot = row.normalizedSnapshotJson as unknown as OneAutoVinLookupEuSuggestionSnapshot;
      const comparison = compareOemVinLookupEuSuggestions(snapshot, canonicalByField);
      return {
        snapshotId: row.id,
        providerJobId: row.providerJobId,
        serviceSku: 'OE_VIN_LOOKUP_EU' as const,
        vinSha256Prefix: row.vinSha256Prefix,
        timestamps: comparison.timestamps,
        comparison,
      };
    });

    const dto: OneAutoOemVinLookupEuSuggestionListDto = {
      organizationId: orgId,
      vehicleId,
      featureEnabled: true,
      suggestions,
    };
    assertSafeOemSuggestionListDto(dto);
    return dto;
  }
}
