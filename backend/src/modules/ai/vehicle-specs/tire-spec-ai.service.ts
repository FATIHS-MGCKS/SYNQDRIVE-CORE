import { Injectable, Logger } from '@nestjs/common';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import type { VehicleSpecStreamEmit } from './vehicle-spec-ai.types';
import {
  buildTireSpecJsonSchema,
  buildTireSpecPrompt,
  parseTireSpecJson,
  type TireSpecContext,
} from './tire-spec-ai.schema.util';
import { processAiTireSpecCompactLlmOutput } from '../../vehicle-intelligence/tires/ai-tire-spec-compact-pipeline.util';

const CONFIG_ERROR =
  'AI provider not configured (set MISTRAL_API_KEY and AI_PROVIDER=mistral)';

/**
 * Mistral-backed tire specification extraction (knowledge-only, no DIMO Agents).
 */
@Injectable()
export class TireSpecAiService {
  private readonly logger = new Logger(TireSpecAiService.name);

  constructor(private readonly llm: LlmGatewayService) {}

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

  async getTireSpecsStream(
    tireContext: TireSpecContext,
    emit: VehicleSpecStreamEmit,
  ): Promise<void> {
    if (!this.isConfigured()) {
      emit('step', { step: 'Configuration check', status: 'error', detail: CONFIG_ERROR });
      emit('error', { message: 'AI provider not configured', configFailure: true });
      return;
    }
    emit('step', { step: 'Konfiguration prüfen', status: 'done', detail: 'AI Provider OK' });
    emit('step', {
      step: 'Reifen-Scope',
      status: 'done',
      detail: 'Wissensdatenbank-Reifenanalyse (kein DIMO-Fahrzeug-Scope)',
    });

    emit('step', { step: 'Reifendaten abfragen', status: 'working', detail: 'Anfrage wird verarbeitet...' });
    emit('progress', { type: 'status', content: 'Strukturierte Reifenspezifikationen werden abgerufen...' });

    try {
      const { system, user } = buildTireSpecPrompt(tireContext);
      const result = await this.llm.completeJson<Record<string, unknown>>({
        purpose: 'json',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: buildTireSpecJsonSchema(),
        schemaName: 'synqdrive_tire_specs',
      });

      emit('step', { step: 'Reifendaten abfragen', status: 'done', detail: 'Antwort empfangen' });
      emit('step', { step: 'Daten verarbeiten', status: 'working' });

      const parsed = parseTireSpecJson(result.data);
      const compact = processAiTireSpecCompactLlmOutput(parsed, tireContext);
      const specs = { ...compact };
      const hasData = Object.values(specs).some((v) => v !== null);

      if (hasData) {
        emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Reifenspezifikationen extrahiert' });
      } else {
        emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Keine strukturierten Daten' });
        this.logger.warn(
          `[TireSpecAI] Empty structured output: ${result.rawContent?.slice(0, 500)}`,
        );
      }

      emit('result', {
        success: true,
        degraded: !hasData,
        knowledgeOnlyFallback: true,
        dimoVehicleConnected: false,
        agentId: this.llm.activeProviderId,
        specs,
      });
    } catch (err: unknown) {
      const message = this.sanitizeError(err);
      emit('step', { step: 'Reifendaten abfragen', status: 'error', detail: message });
      emit('error', { message });
    }
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
      .slice(0, 300);
  }
}
