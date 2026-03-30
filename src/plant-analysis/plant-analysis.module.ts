import { Module } from '@nestjs/common';
import { PlantAnalysisController } from './plant-analysis.controller';
import { PlantAnalysisService } from './plant-analysis.service';

@Module({
  controllers: [PlantAnalysisController],
  providers: [PlantAnalysisService],
})
export class PlantAnalysisModule {}
