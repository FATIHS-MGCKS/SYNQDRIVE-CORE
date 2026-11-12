import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { StationsModule } from '@modules/stations/stations.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { SupportModule } from '@modules/support/support.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
import { CommunicationModule } from '@modules/communication/communication.module';
import { VoiceWebhookIngestionModule } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.module';
import { VoiceMcpGatewayController } from './voice-mcp-gateway.controller';
import { VoiceMcpApprovalController } from './voice-mcp-approval.controller';
import { VoiceMcpTokenService } from './voice-mcp-token.service';
import { VoiceMcpNonceStore } from './voice-mcp-nonce.store';
import { VoiceMcpProtocolService } from './voice-mcp-protocol.service';
import {
  VoiceMcpAuditService,
  VoiceMcpGatewayMiddlewareService,
  VoiceMcpToolsService,
} from './voice-mcp-tools.service';
import { VoiceMcpEntityResolverService } from './voice-mcp-entity-resolver.service';
import { VoiceMcpRateLimitService } from './voice-mcp-rate-limit.service';
import { VoiceMcpConfirmationService } from './voice-mcp-confirmation.service';
import { VoiceMcpWriteToolsService } from './voice-mcp-write-tools.service';
import { VoiceMcpApprovalService } from './voice-mcp-approval.service';
import { VoiceMcpActionOrchestratorService } from './voice-mcp-action-orchestrator.service';
import {
  VoiceApprovalRequestRepository,
  VoiceToolExecutionRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import {
  VoiceAgentDeploymentRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    SharedGuardsModule,
    CustomersModule,
    BookingsModule,
    VehiclesModule,
    InvoicesModule,
    StationsModule,
    OrganizationsModule,
    TasksModule,
    SupportModule,
    OutboundEmailModule,
    DocumentsModule,
    VoiceWebhookIngestionModule,
    CommunicationModule,
  ],
  controllers: [VoiceMcpGatewayController, VoiceMcpApprovalController],
  providers: [
    VoiceMcpTokenService,
    VoiceMcpNonceStore,
    VoiceMcpProtocolService,
    VoiceMcpGatewayMiddlewareService,
    VoiceMcpToolsService,
    VoiceMcpAuditService,
    VoiceMcpEntityResolverService,
    VoiceMcpRateLimitService,
    VoiceMcpConfirmationService,
    VoiceMcpWriteToolsService,
    VoiceMcpApprovalService,
    VoiceMcpActionOrchestratorService,
    VoiceToolExecutionRepository,
    VoiceApprovalRequestRepository,
    VoiceAgentDeploymentRepository,
    VoiceSubscriptionRepository,
  ],
  exports: [VoiceMcpTokenService, VoiceMcpProtocolService, VoiceMcpApprovalService],
})
export class VoiceMcpGatewayModule {}
