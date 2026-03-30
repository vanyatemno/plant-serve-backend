import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaginatedPlantAnalysisResponseDto,
  PaginationQueryDto,
  PlantAnalysisResponseDto,
} from './dto';

interface MlTopPrediction {
  label: string;
  confidence: number;
  class_id: number;
}

interface MlServiceResponse {
  prediction: string;
  confidence: number;
  class_id: number;
  is_healthy: boolean;
  plant_type: string;
  top_predictions: MlTopPrediction[];
}

@Injectable()
export class PlantAnalysisService {
  private readonly logger = new Logger(PlantAnalysisService.name);
  private readonly s3Client: S3Client;
  private readonly anthropic: Anthropic;
  private readonly s3Bucket: string;
  private readonly mlServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });

    this.anthropic = new Anthropic({
      apiKey: this.configService.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });

    this.s3Bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    this.mlServiceUrl = this.configService.getOrThrow<string>('ML_SERVICE_URL');
  }

  // ─── Upload & Analyze ──────────────────────────────────────────────
  async uploadAndAnalyze(
    userId: string,
    file: Express.Multer.File,
  ): Promise<PlantAnalysisResponseDto> {
    // 1. Upload to S3
    const s3Key = await this.uploadToS3(file);

    // 2. Call ML microservice
    const mlResponse = await this.callMlService(s3Key);

    // 3. AI enrichment via Anthropic Claude
    const aiAdvice = await this.getAiAdvice(mlResponse);

    // 4. Persist to DB
    const analysis = await this.prisma.plantAnalysis.create({
      data: {
        userId,
        s3Key,
        prediction: mlResponse.prediction,
        confidence: mlResponse.confidence,
        isHealthy: mlResponse.is_healthy,
        plantType: mlResponse.plant_type,
        mlResponse: mlResponse as any,
        aiAdvice,
      },
    });

    return analysis;
  }

  // ─── List (paginated) ──────────────────────────────────────────────
  async findAllByUser(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedPlantAnalysisResponseDto> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.plantAnalysis.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.plantAnalysis.count({ where: { userId } }),
    ]);

    return { data, total, page, limit };
  }

  // ─── Find One ──────────────────────────────────────────────────────
  async findOneByUser(
    analysisId: string,
    userId: string,
  ): Promise<PlantAnalysisResponseDto> {
    const analysis = await this.prisma.plantAnalysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new NotFoundException('Analysis not found');
    }

    // Enforce ownership at the service layer
    if (analysis.userId !== userId) {
      throw new ForbiddenException('You do not have access to this analysis');
    }

    return analysis;
  }

  // ─── Private: S3 Upload ────────────────────────────────────────────
  private async uploadToS3(file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.split('.').pop() || 'jpg';
    const key = `plant-images/${uuidv4()}.${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      return key;
    } catch (error) {
      this.logger.error('S3 upload failed', error);
      throw new InternalServerErrorException(
        'Failed to upload image to storage',
      );
    }
  }

  // ─── Private: ML Service Call ──────────────────────────────────────
  private async callMlService(s3Key: string): Promise<MlServiceResponse> {
    try {
      const response = await fetch(this.mlServiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3_key: s3Key }),
      });

      if (!response.ok) {
        throw new Error(`ML service responded with status ${response.status}`);
      }

      return (await response.json()) as MlServiceResponse;
    } catch (error) {
      this.logger.error('ML service call failed', error);
      throw new InternalServerErrorException(
        'Failed to get prediction from ML service',
      );
    }
  }

  // ─── Private: Anthropic AI Enrichment ──────────────────────────────
  private async getAiAdvice(mlResponse: MlServiceResponse): Promise<string> {
    const { confidence, prediction, plant_type, top_predictions, is_healthy } =
      mlResponse;

    let prompt: string;

    if (confidence < 0.75) {
      // Low confidence — ask Claude to independently estimate
      prompt = `You are an expert plant pathologist. An ML model analyzed a plant image but returned a low-confidence result.

Plant type detected: ${plant_type}
ML prediction: ${prediction} (confidence: ${(confidence * 100).toFixed(2)}%)
Is healthy: ${is_healthy}

Top predictions from the model:
${top_predictions.map((p) => `- ${p.label}: ${(p.confidence * 100).toFixed(4)}%`).join('\n')}

Full ML response: ${JSON.stringify(mlResponse)}

Because the confidence is low, please:
1. Independently estimate the most likely plant disease based on the plant type and the top predictions provided
2. Provide your own diagnosis with reasoning
3. Give practical care and treatment advice for the most likely condition
4. Mention any additional symptoms the user should look for to confirm the diagnosis

Please be thorough but practical in your response.`;
    } else {
      // High confidence — generate treatment guide
      prompt = `You are an expert plant pathologist. An ML model has identified a plant condition with high confidence.

Plant type: ${plant_type}
Diagnosis: ${prediction} (confidence: ${(confidence * 100).toFixed(2)}%)
Is healthy: ${is_healthy}

Full ML response: ${JSON.stringify(mlResponse)}

Please provide a comprehensive, practical care and treatment guide for this condition:
1. Brief explanation of what ${prediction} is and how it affects ${plant_type}
2. Immediate steps the user should take
3. Treatment options (organic and chemical if applicable)
4. Prevention strategies for the future
5. Expected recovery timeline if treatment is followed

${is_healthy ? 'Since the plant appears healthy, focus on maintenance tips and preventive care.' : 'Focus on treatment and recovery steps.'}

Please be thorough but practical in your response.`;
    }

    try {
      const message = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract text from the response
      const textBlock = message.content.find((block) => block.type === 'text');
      return textBlock?.text || 'No advice could be generated.';
    } catch (error) {
      this.logger.error('Anthropic API call failed', error);
      return 'AI advice is temporarily unavailable. Please consult a local plant specialist.';
    }
  }
}
