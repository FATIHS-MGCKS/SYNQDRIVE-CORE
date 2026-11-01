import { request, requestResult, type RequestResultMeta } from '../../lib/api';
import type {
  OneAutoCatalogResponse,
  OneAutoExecuteBody,
  OneAutoJobDto,
  OneAutoJobResultResponse,
  OneAutoQuoteResponse,
} from './oneauto-api.types';

function base(orgId: string): string {
  return `/admin/organizations/${encodeURIComponent(orgId)}/oneauto`;
}

export const oneAutoMasterApi = {
  getCatalog(orgId: string): Promise<OneAutoCatalogResponse> {
    return request<OneAutoCatalogResponse>(`${base(orgId)}/catalog`);
  },

  quote(orgId: string, vehicleId: string, serviceSku: string): Promise<OneAutoQuoteResponse> {
    return request<OneAutoQuoteResponse>(
      `${base(orgId)}/vehicles/${encodeURIComponent(vehicleId)}/quote`,
      {
        method: 'POST',
        body: JSON.stringify({ serviceSku }),
      },
    );
  },

  execute(
    orgId: string,
    vehicleId: string,
    body: OneAutoExecuteBody,
    meta?: RequestResultMeta,
  ) {
    return requestResult<OneAutoJobDto>(
      `${base(orgId)}/vehicles/${encodeURIComponent(vehicleId)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      meta,
    );
  },

  getJob(orgId: string, jobId: string): Promise<OneAutoJobDto> {
    return request<OneAutoJobDto>(`${base(orgId)}/jobs/${encodeURIComponent(jobId)}`);
  },

  getJobResult(orgId: string, jobId: string): Promise<OneAutoJobResultResponse> {
    return request<OneAutoJobResultResponse>(
      `${base(orgId)}/jobs/${encodeURIComponent(jobId)}/result`,
    );
  },
};
