import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_GENERATOR_SERVICE,
  type AIGeneratorService,
  type IAiEnrichmentService,
  type MlServiceResponse,
} from '../interfaces';

@Injectable()
export class AiEnrichmentService implements IAiEnrichmentService {
  private readonly logger = new Logger(AiEnrichmentService.name);

  constructor(
    @Inject(AI_GENERATOR_SERVICE)
    private readonly aiGeneratorService: AIGeneratorService,
  ) {}

  async getAdvice(mlResponse: MlServiceResponse): Promise<string> {
    const prompt = this.buildPrompt(mlResponse);

    try {
      const result = await this.aiGeneratorService.generatePlain(prompt);

      return result || 'No advice could be generated.';
    } catch (error) {
      this.logger.error('AI advice generation failed', error);
      return 'AI advice is temporarily unavailable. Please consult a local plant specialist.';
    }
  }

  private buildPrompt(mlResponse: MlServiceResponse): string {
    const { confidence, prediction, plant_type, top_predictions, is_healthy } =
      mlResponse;

    if (confidence < 0.75) {
      return this.buildLowConfidencePrompt(
        plant_type,
        prediction,
        confidence,
        is_healthy,
        top_predictions,
        mlResponse,
      );
    }

    return this.buildHighConfidencePrompt(
      plant_type,
      prediction,
      confidence,
      is_healthy,
      mlResponse,
    );
  }

  private buildLowConfidencePrompt(
    plantType: string,
    prediction: string,
    confidence: number,
    isHealthy: boolean,
    topPredictions: MlServiceResponse['top_predictions'],
    mlResponse: MlServiceResponse,
  ): string {
    return `You are an expert plant pathologist. An ML model analyzed a plant image but returned a low-confidence result.

Plant type detected: ${plantType}
ML prediction: ${prediction} (confidence: ${(confidence * 100).toFixed(2)}%)
Is healthy: ${isHealthy}

Top predictions from the model:
${topPredictions.map((p) => `- ${p.label}: ${(p.confidence * 100).toFixed(4)}%`).join('\n')}

Full ML response: ${JSON.stringify(mlResponse)}

Because the confidence is low, please:
1. Independently estimate the most likely plant disease based on the plant type and the top predictions provided
2. Provide your own diagnosis with reasoning
3. Give practical care and treatment advice for the most likely condition
4. Mention any additional symptoms the user should look for to confirm the diagnosis

Please be thorough but practical in your response.`;
  }

  private buildHighConfidencePrompt(
    plantType: string,
    prediction: string,
    confidence: number,
    isHealthy: boolean,
    mlResponse: MlServiceResponse,
  ): string {
    return `You are an expert plant pathologist. An ML model has identified a plant condition with high confidence.

Plant type: ${plantType}
Diagnosis: ${prediction} (confidence: ${(confidence * 100).toFixed(2)}%)
Is healthy: ${isHealthy}

Full ML response: ${JSON.stringify(mlResponse)}

Please provide a comprehensive, practical care and treatment guide for this condition:
1. Brief explanation of what ${prediction} is and how it affects ${plantType}
2. Immediate steps the user should take
3. Treatment options (organic and chemical if applicable)
4. Prevention strategies for the future
5. Expected recovery timeline if treatment is followed

${isHealthy ? 'Since the plant appears healthy, focus on maintenance tips and preventive care.' : 'Focus on treatment and recovery steps.'}

Please be thorough but practical in your response.`;
  }
}
