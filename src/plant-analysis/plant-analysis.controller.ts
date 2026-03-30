import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { PlantAnalysisService } from './plant-analysis.service';
import {
  PaginatedPlantAnalysisResponseDto,
  PaginationQueryDto,
  PlantAnalysisResponseDto,
} from './dto';
import { JwtAuthGuard } from '../common';
import { CurrentUser } from '../common';
import type { JwtPayload } from '../common';

@ApiTags('Plant Analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plant-analysis')
export class PlantAnalysisController {
  constructor(private readonly plantAnalysisService: PlantAnalysisService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|jpg)$/)) {
          cb(
            new Error('Only image files (jpeg, png, webp) are allowed'),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a plant image for analysis' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Plant image file (jpeg, png, webp)',
        },
      },
      required: ['image'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Analysis completed',
    type: PlantAnalysisResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PlantAnalysisResponseDto> {
    return this.plantAnalysisService.uploadAndAnalyze(user.sub, file);
  }

  @Get()
  @ApiOperation({ summary: "List current user's plant analyses (paginated)" })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of analyses',
    type: PaginatedPlantAnalysisResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedPlantAnalysisResponseDto> {
    return this.plantAnalysisService.findAllByUser(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single plant analysis by ID' })
  @ApiParam({ name: 'id', description: 'Analysis UUID' })
  @ApiResponse({
    status: 200,
    description: 'Analysis detail',
    type: PlantAnalysisResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — analysis belongs to another user',
  })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlantAnalysisResponseDto> {
    return this.plantAnalysisService.findOneByUser(id, user.sub);
  }
}
