import { Fsd3OneShotPreflightService } from '../fsd3-one-shot-preflight.service';
import { Fsd3OneShotCapabilityService } from '../fsd3-one-shot-capability.service';
import {
  mintFsd3OneShotPreflightTicketV1,
  resolveFsd3OneShotPreflightTicketSecretV1,
} from '../fsd3-one-shot-preflight-ticket.v1';

describe('Fsd3 preflight ticket authoritative binding', () => {
  it('rejects ticket mint without authoritative preflight', () => {
    const svc = new Fsd3OneShotPreflightService({} as never, {} as never, {} as never, new Fsd3OneShotCapabilityService());
    svc.onModuleInit();
    const scope = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
      discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
      executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
    };
    expect(() =>
      svc.mintAuthorizedPreflightTicket({ scope, actorUserId: '55555555-5555-4555-8555-555555555555' }),
    ).toThrow('FSD3_PREFLIGHT_NOT_AUTHORITATIVE');
  });

  it('rejects duplicate mint and forged tickets', () => {
    const secret = Buffer.from('preflight-ticket-secret', 'utf8');
    process.env.FSD3_ONE_SHOT_PREFLIGHT_TICKET_HMAC_SECRET = 'preflight-ticket-secret';
    const svc = new Fsd3OneShotPreflightService({} as never, {} as never, {} as never, new Fsd3OneShotCapabilityService());
    svc.onModuleInit();
    const scope = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      providerSourceLinkId: '33333333-3333-4333-8333-333333333333',
      discoveryRequestKey: '44444444-4444-4444-8444-444444444444',
      executableReleaseSha: 'e32880da1beb99642f1e994f45c4e9038fc1a541',
    };
    const actorUserId = '55555555-5555-4555-8555-555555555555';
    const forgedPreflight = {
      status: 'PREFLIGHT_OK' as const,
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      providerSourceLinkId: scope.providerSourceLinkId,
      dimoVehicleId: '66666666-6666-4666-8666-666666666666',
      dimoTokenId: 7,
      connectionIdentityFingerprint: 'forged',
      linkActive: true,
      authorizationReference: 'forged-ref',
    };
    const forged = mintFsd3OneShotPreflightTicketV1({
      scope,
      preflight: forgedPreflight,
      actorUserId,
      secret: resolveFsd3OneShotPreflightTicketSecretV1(),
    });
    expect(forged).toBeDefined();
    expect(() =>
      svc.mintAuthorizedPreflightTicket({ scope, actorUserId }),
    ).toThrow('FSD3_PREFLIGHT_NOT_AUTHORITATIVE');
  });
});
