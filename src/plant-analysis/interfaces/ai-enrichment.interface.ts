import type { MlServiceResponse } from './ml-response.interface';

export const AI_ENRICHMENT_SERVICE = 'AI_ENRICHMENT_SERVICE';

export interface IAiEnrichmentService {
  /**
   * Generate AI-powered advice based on the ML service response.
   *
   * - If confidence < 0.75: independently estimate the disease and provide diagnosis + advice.
   * - If confidence >= 0.75: generate a practical care/treatment guide for the predicted disease.
   *
   * @param mlResponse - The raw response from the ML microservice
   * @returns A string containing the AI-generated advice
   */
  getAdvice(mlResponse: MlServiceResponse): Promise<string>;
}
