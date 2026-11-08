import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceEventsService } from '@modules/vehicle-intelligence/service-events/service-events.service';
import {
  buildInspectionApplyPayload,
  isInspectionDocumentType,
} from '../document-inspection-extraction.rules';
import {
  assessServiceApplyGate,
  buildServiceApplyPayload,
  isServiceDocumentType,
  type ServiceDocumentType,
} from '../document-service-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

async function executeCreateServiceEvent(
  serviceEvents: ServiceEventsService,
  context: import('../document-action-executor.interface').DocumentActionExecutionContext,
) {
  if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
    return context.priorResult;
  }

  if (!context.organizationId) {
    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
      errorCode: 'SERVICE_EVENT_MISSING_ORGANIZATION',
      errorMessage: 'Organization is required to create a service event',
    };
  }

  if (isServiceDocumentType(context.documentType)) {
    const gate = assessServiceApplyGate({
      documentType: context.documentType,
      fields: context.confirmedData,
    });
    const payload = buildServiceApplyPayload(
      context.documentType as ServiceDocumentType,
      context.confirmedData,
    );
    if (!gate.canApply || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'SERVICE_GATE_BLOCKED',
        errorMessage: 'Service apply gate blocked — required confirmed fields missing',
        output: { blockers: gate.blockers },
      };
    }

    try {
      const event = await serviceEvents.createFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        eventType: payload.eventType,
        eventDate: payload.eventDate,
        odometerKm: payload.odometerKm,
        workshopName: payload.workshopName,
        notes: payload.notes,
        costCents: payload.costCents,
        documentUrl: context.sourceFileUrl,
        performedWork: payload.performedWork,
        serviceKind: payload.serviceKind,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'serviceEvent',
        resultEntityId: event.id,
        output: {
          serviceEventId: event.id,
          eventType: event.eventType,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapServiceEventError(error);
    }
  }

  if (isInspectionDocumentType(context.documentType)) {
    const payload = buildInspectionApplyPayload(context.documentType, context.confirmedData);
    if (!payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'INSPECTION_GATE_BLOCKED',
        errorMessage: 'Inspection apply gate blocked — required confirmed fields missing',
      };
    }

    try {
      const event = await serviceEvents.createFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        eventType: payload.eventType,
        eventDate: payload.eventDate,
        odometerKm: payload.odometerKm,
        workshopName: payload.workshopName,
        notes: payload.notes,
        documentUrl: context.sourceFileUrl,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'serviceEvent',
        resultEntityId: event.id,
        output: {
          serviceEventId: event.id,
          eventType: event.eventType,
          canUpdateVehicleMasterData: payload.canUpdateVehicleMasterData,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapServiceEventError(error);
    }
  }

  return {
    status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
    errorCode: 'UNSUPPORTED_SERVICE_DOCUMENT_TYPE',
    errorMessage: `Unsupported document type for service event create: ${context.documentType}`,
  };
}

function mapServiceEventError(error: unknown) {
  if (error instanceof DocumentActionBusinessError) {
    throw error;
  }
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    const payload =
      typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);
    throw new DocumentActionBusinessError(
      String(payload.code ?? DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION),
      String(payload.message ?? error.message),
      payload,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
    errorCode: DOCUMENT_ACTION_ERROR_CODES.TECHNICAL_FAILURE,
    errorMessage: message,
  };
}

@Injectable()
export class CreateServiceEventDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_SERVICE_EVENT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_SERVICE_EVENT;

  constructor(private readonly serviceEvents: ServiceEventsService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    return executeCreateServiceEvent(this.serviceEvents, context);
  }
}

@Injectable()
export class CreateComplianceServiceEventDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_COMPLIANCE_SERVICE_EVENT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_COMPLIANCE_SERVICE_EVENT;

  constructor(private readonly serviceEvents: ServiceEventsService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    return executeCreateServiceEvent(this.serviceEvents, context);
  }
}
