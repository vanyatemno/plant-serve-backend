import { ApiProperty } from '@nestjs/swagger';

export class PlantAnalysisResponseDto {
  @ApiProperty({ description: 'Analysis UUID' })
  id: string;

  @ApiProperty({ description: 'User UUID who owns this analysis' })
  userId: string;

  @ApiProperty({ description: 'S3 object key of the uploaded image' })
  s3Key: string;

  @ApiProperty({ description: 'ML model prediction label', example: 'Strawberry with Leaf Scorch' })
  prediction: string;

  @ApiProperty({ description: 'Confidence score from ML model', example: 0.999 })
  confidence: number;

  @ApiProperty({ description: 'Whether the plant is healthy', example: false })
  isHealthy: boolean;

  @ApiProperty({ description: 'Type of plant detected', example: 'Strawberry' })
  plantType: string;

  @ApiProperty({ description: 'Raw ML service response as JSON' })
  mlResponse: any;

  @ApiProperty({ description: 'AI-generated care/treatment advice' })
  aiAdvice: string;

  @ApiProperty({ description: 'Timestamp of analysis creation' })
  createdAt: Date;
}

export class PaginatedPlantAnalysisResponseDto {
  @ApiProperty({ type: [PlantAnalysisResponseDto] })
  data: PlantAnalysisResponseDto[];

  @ApiProperty({ description: 'Total number of records', example: 42 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit: number;
}
