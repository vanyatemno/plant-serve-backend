import { ZodType } from 'zod/v3';

export const AI_GENERATOR_SERVICE = 'AI GENERATOR_SERVICE';

export interface AIGeneratorService {
  /**
   * Generates plain string response from AI.
   * @param prompt
   * @returns resulting string generated with AI
   */
  generatePlain(prompt: string): Promise<string>;

  /**
   * Generates structured response with AI.
   * @param prompt
   * @param structure - Zod structure to be filled with AI response
   * @returns structured output of specified type
   */
  generateStructured<T>(prompt: string, structure: ZodType<T>): Promise<T>;

  /**
   * Generates plain string response for prompt + image to analyze.
   * @param prompt
   * @param image
   * @returns Promise
   */
  generatePlainForImage(prompt: string, image: Express.Multer.File): Promise<string>;
}
