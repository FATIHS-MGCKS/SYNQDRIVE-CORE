import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export function oneAutoDisabledException() {
  return new ForbiddenException({ code: 'ONEAUTO_DISABLED', message: 'One Auto provider is disabled' });
}

export function oneAutoUnavailableException(reason: string) {
  return new BadRequestException({ code: 'ONEAUTO_SERVICE_UNAVAILABLE', message: reason });
}

export function oneAutoInvalidVinException() {
  return new BadRequestException({ code: 'ONEAUTO_INVALID_VIN', message: 'Vehicle VIN is missing or invalid' });
}

export function oneAutoPriceMismatchException() {
  return new ConflictException({ code: 'ONEAUTO_PRICE_MISMATCH', message: 'Confirmed price does not match current quotation' });
}

export function oneAutoBudgetExceededException() {
  return new ConflictException({ code: 'ONEAUTO_BUDGET_EXCEEDED', message: 'Organization One Auto daily budget would be exceeded' });
}

export function oneAutoBudgetNotConfiguredException() {
  return new ConflictException({
    code: 'ONEAUTO_BUDGET_NOT_CONFIGURED',
    message:
      'Organization One Auto daily budget must be configured with a positive finite cap before execution when the provider is enabled',
  });
}

export function oneAutoCrossTenantException() {
  return new ForbiddenException({ code: 'ONEAUTO_CROSS_TENANT', message: 'Vehicle does not belong to this organization' });
}

export function oneAutoJobNotFoundException() {
  return new NotFoundException({ code: 'ONEAUTO_JOB_NOT_FOUND', message: 'One Auto provider job not found' });
}

export function oneAutoConfirmationRequiredException() {
  return new BadRequestException({
    code: 'ONEAUTO_COST_CONFIRMATION_REQUIRED',
    message: 'Explicit cost confirmation is required before execution',
  });
}

export function oneAutoContractUnverifiedException(serviceSku: string) {
  return new BadRequestException({
    code: 'CONTRACT_UNVERIFIED',
    message: 'One Auto provider contract is not verified for this service',
    serviceSku,
  });
}

export function oneAutoQuoteExpiredException() {
  return new BadRequestException({
    code: 'ONEAUTO_QUOTE_EXPIRED',
    message: 'Cost quotation expired — request a new quote before execution',
  });
}

export function oneAutoBindingMismatchException() {
  return new ForbiddenException({
    code: 'ONEAUTO_BINDING_MISMATCH',
    message: 'Organization, vehicle, or VIN binding failed server-side validation',
  });
}
