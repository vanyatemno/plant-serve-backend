import { Module } from '@nestjs/common';
import { PlantAnalysisController } from './plant-analysis.controller';
import { PlantAnalysisService } from './plant-analysis.service';
import { AiEnrichmentService } from './services/ai-enrichment.service';
import { AI_ENRICHMENT_SERVICE, AI_GENERATOR_SERVICE } from './interfaces';
import { OpenrouterProviderService } from './services/openrouter-provider.service';

@Module({
  controllers: [PlantAnalysisController],
  providers: [
    PlantAnalysisService,
    {
      provide: AI_ENRICHMENT_SERVICE,
      useClass: AiEnrichmentService,
    },
    {
      provide: AI_GENERATOR_SERVICE,
      useClass: OpenrouterProviderService,
    },
  ],
})
export class PlantAnalysisModule {}
