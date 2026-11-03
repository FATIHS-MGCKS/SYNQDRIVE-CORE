import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common/interfaces';
import type { Request } from 'express';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';

/** Public One Auto async callback ingress — authenticated via unguessable delivery token in path. */
@Controller('webhooks/oneauto')
export class OneAutoProviderCallbackController {
  constructor(private readonly callbackService: OneAutoProviderCallbackService) {}

  @Post('provider-callback/:deliveryToken')
  @HttpCode(200)
  async ingestProviderCallback(
    @Param('deliveryToken') deliveryToken: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!deliveryToken?.trim()) {
      throw new NotFoundException();
    }
    const rawBody =
      req.rawBody && Buffer.isBuffer(req.rawBody)
        ? req.rawBody.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});

    let parsedBody: unknown = null;
    if (rawBody.trim()) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = { _nonJsonBody: true };
      }
    }

    const result = await this.callbackService.ingestProviderCallback({
      deliveryToken: deliveryToken.trim(),
      rawBody,
      parsedBody,
    });

    if (!result.ok) {
      if (result.status === 'unknown_token') throw new NotFoundException();
      throw new ServiceUnavailableException('One Auto callback path disabled');
    }

    return { ok: true, disposition: result.status };
  }
}
