import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ZodType } from 'zod/v3';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { AIGeneratorService } from '../interfaces';

@Injectable()
export class OpenrouterProviderService implements AIGeneratorService {
  private readonly client: OpenAI;
  private readonly generationModel: string;
  private readonly logger = new Logger(OpenrouterProviderService.name);
  private readonly baseURL = 'https://openrouter.ai/api/v1';

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      baseURL: this.baseURL,
      apiKey: this.configService.getOrThrow<string>('OPENROUTER_API_KEY'),
    });
    this.generationModel =
      this.configService.get<string>('OPENROUTER_MODEL') ||
      'gpt-5.4';
  }
  async generatePlainForImage(
    prompt: string,
    image: Express.Multer.File,
  ): Promise<string> {
    try {
      const base64Image = image.buffer.toString('base64');

      const response = await this.client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_image',
                detail: 'auto',
                image_url: `data:image/jpeg;base64,${base64Image}`,
              },
            ],
          },
        ],
      });

      return response.output_text;
    } catch (error: any) {
      this.logger.error(error);
      throw new Error('Failed to generate plain response for image')
    }
  }

  async generatePlain(prompt: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.generationModel,
      });

      return completion.choices[0].message.content || '';
    } catch (error: any) {
      this.logger.error(`Error generating plain response: ${error.message}`);
      throw new Error('Failed to generate plain response');
    }
  }

  async generateStructured<T>(
    prompt: string,
    structure: ZodType<T>,
  ): Promise<T> {
    try {
      const completion = await this.client.chat.completions.parse({
        messages: [{ role: 'user', content: prompt }],
        model: this.generationModel,
        response_format: zodResponseFormat(structure, 'result'),
      });

      const parsed = completion.choices[0].message.parsed;
      if (!parsed) {
        throw new Error('Failed to parse structured response');
      }

      return parsed as T;
    } catch (error: any) {
      this.logger.error(
        `Error generating structured response: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to generate structured response');
    }
  }
}
