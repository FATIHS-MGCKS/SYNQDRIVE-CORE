import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  mintFsd3OneShotExecutionCapabilityV1,
  resolveFsd3OneShotCapabilitySecretV1,
  verifyFsd3OneShotExecutionCapabilityV1,
  type Fsd3OneShotExecutionCapabilityPayloadV1,
} from './fsd3-one-shot-execution-capability.v1';

@Injectable()
export class Fsd3OneShotCapabilityService implements OnModuleInit {
  private secret!: Buffer;

  onModuleInit(): void {
    this.secret = resolveFsd3OneShotCapabilitySecretV1();
  }

  mint(input: Parameters<typeof mintFsd3OneShotExecutionCapabilityV1>[0]['payload']): string {
    return mintFsd3OneShotExecutionCapabilityV1({ payload: input, secret: this.secret });
  }

  verify(token: string, now?: Date): Fsd3OneShotExecutionCapabilityPayloadV1 {
    return verifyFsd3OneShotExecutionCapabilityV1({ token, secret: this.secret, now });
  }
}
