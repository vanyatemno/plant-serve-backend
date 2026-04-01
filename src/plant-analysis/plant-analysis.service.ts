import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaginatedPlantAnalysisResponseDto,
  PaginationQueryDto,
  PlantAnalysisResponseDto,
} from './dto';
import {
  AI_ENRICHMENT_SERVICE,
  type IAiEnrichmentService,
} from './interfaces';
import type { MlServiceResponse } from './interfaces';

@Injectable()
export class PlantAnalysisService {
  private readonly logger = new Logger(PlantAnalysisService.name);
  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly mlServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(AI_ENRICHMENT_SERVICE)
    private readonly aiEnrichmentService: IAiEnrichmentService,
  ) {
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
      ...(this.configService.get<string>('AWS_S3_ENDPOINT') && {
        endpoint: this.configService.get<string>('AWS_S3_ENDPOINT'),
        forcePathStyle: true,
      }),
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
    const mlResponse = await this.callMlService(file);
    this.logger.log(mlResponse);

    // 3. AI enrichment via injected service
    const aiAdvice = await this.aiEnrichmentService.getAdvice(mlResponse);

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
  private async callMlService(
    // s3Key: string,
    image: Express.Multer.File,
    ): Promise<MlServiceResponse> {
    try {
      const response = await fetch(`${this.mlServiceUrl}/predict/base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // body: JSON.stringify({ s3_key: s3Key }), // todo: change to s3 key
        body: JSON.stringify({
          image: `data:image/jpeg;base64,${image.buffer.toString('base64')}`,
          top_k: 1,
        }),
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
}
