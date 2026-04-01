// import { Test, TestingModule } from '@nestjs/testing';
// import { ConfigService } from '@nestjs/config';
// import OpenAI from 'openai';
// import { z } from 'zod/v3';
// import { OpenrouterProviderService } from './openrouter-provider.service';
//
// // ---------------------------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------------------------
//
// function makeMockFile(content = 'fake-image-bytes'): Express.Multer.File {
//   return {
//     buffer: Buffer.from(content),
//     mimetype: 'image/jpeg',
//     originalname: 'test.jpg',
//     fieldname: 'file',
//     encoding: '7bit',
//     size: content.length,
//     destination: '',
//     filename: '',
//     path: '',
//     stream: null as any,
//   };
// }
//
// // ---------------------------------------------------------------------------
// // Mocks
// // ---------------------------------------------------------------------------
//
// const mockChatCompletionsCreate = jest.fn();
// const mockChatCompletionsParse = jest.fn();
// const mockResponsesCreate = jest.fn();
//
// jest.mock('openai', () => {
//   return {
//     __esModule: true,
//     default: jest.fn().mockImplementation(() => ({
//       chat: {
//         completions: {
//           create: mockChatCompletionsCreate,
//           parse: mockChatCompletionsParse,
//         },
//       },
//       responses: {
//         create: mockResponsesCreate,
//       },
//     })),
//   };
// });
//
// // ---------------------------------------------------------------------------
// // Test suite
// // ---------------------------------------------------------------------------
//
// describe('OpenrouterProviderService (integration)', () => {
//   let service: OpenrouterProviderService;
//
//   const configValues: Record<string, string> = {
//     OPENROUTER_API_KEY: 'test-api-key',
//     OPENROUTER_MODEL: 'anthropic/claude-sonnet-4-20250514',
//   };
//
//   beforeEach(async () => {
//     jest.clearAllMocks();
//
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         OpenrouterProviderService,
//         {
//           provide: ConfigService,
//           useValue: {
//             get: (key: string) => configValues[key],
//             getOrThrow: (key: string) => {
//               const val = configValues[key];
//               if (!val) throw new Error(`Config key "${key}" not found`);
//               return val;
//             },
//           },
//         },
//       ],
//     }).compile();
//
//     service = module.get<OpenrouterProviderService>(OpenrouterProviderService);
//   });
//
//   // -------------------------------------------------------------------------
//   // Constructor / initialisation
//   // -------------------------------------------------------------------------
//
//   describe('initialisation', () => {
//     it('should be defined', () => {
//       expect(service).toBeDefined();
//     });
//
//     it('should instantiate OpenAI client with the correct baseURL and API key', () => {
//       expect(OpenAI).toHaveBeenCalledWith({
//         baseURL: 'https://openrouter.ai/api/v1',
//         apiKey: 'test-api-key',
//       });
//     });
//
//     it('should fall back to the default model when OPENROUTER_MODEL is not set', async () => {
//       const moduleWithoutModel: TestingModule = await Test.createTestingModule({
//         providers: [
//           OpenrouterProviderService,
//           {
//             provide: ConfigService,
//             useValue: {
//               get: (_key: string) => undefined,
//               getOrThrow: (_key: string) => 'test-api-key',
//             },
//           },
//         ],
//       }).compile();
//
//       const svcWithDefault = moduleWithoutModel.get<OpenrouterProviderService>(
//         OpenrouterProviderService,
//       );
//
//       mockChatCompletionsCreate.mockResolvedValueOnce({
//         choices: [{ message: { content: 'ok' } }],
//       });
//
//       await svcWithDefault.generatePlain('hello');
//
//       expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
//         expect.objectContaining({
//           model: 'anthropic/claude-sonnet-4-20250514',
//         }),
//       );
//     });
//
//     it('should throw when OPENROUTER_API_KEY is missing', async () => {
//       await expect(
//         Test.createTestingModule({
//           providers: [
//             OpenrouterProviderService,
//             {
//               provide: ConfigService,
//               useValue: {
//                 get: () => undefined,
//                 getOrThrow: () => {
//                   throw new Error('Config key "OPENROUTER_API_KEY" not found');
//                 },
//               },
//             },
//           ],
//         }).compile(),
//       ).rejects.toThrow('OPENROUTER_API_KEY');
//     });
//   });
//
//   // -------------------------------------------------------------------------
//   // generatePlain
//   // -------------------------------------------------------------------------
//
//   describe('generatePlain', () => {
//     it('should return the assistant message content on success', async () => {
//       mockChatCompletionsCreate.mockResolvedValueOnce({
//         choices: [{ message: { content: 'Hello, world!' } }],
//       });
//
//       const result = await service.generatePlain('Say hello');
//
//       expect(result).toBe('Hello, world!');
//     });
//
//     it('should pass the prompt and configured model to the OpenAI client', async () => {
//       mockChatCompletionsCreate.mockResolvedValueOnce({
//         choices: [{ message: { content: 'response' } }],
//       });
//
//       await service.generatePlain('Test prompt');
//
//       expect(mockChatCompletionsCreate).toHaveBeenCalledWith({
//         messages: [{ role: 'user', content: 'Test prompt' }],
//         model: 'anthropic/claude-sonnet-4-20250514',
//       });
//     });
//
//     it('should return an empty string when the model returns null content', async () => {
//       mockChatCompletionsCreate.mockResolvedValueOnce({
//         choices: [{ message: { content: null } }],
//       });
//
//       const result = await service.generatePlain('prompt');
//
//       expect(result).toBe('');
//     });
//
//     it('should throw a wrapped error when the OpenAI call fails', async () => {
//       mockChatCompletionsCreate.mockRejectedValueOnce(
//         new Error('Network timeout'),
//       );
//
//       await expect(service.generatePlain('prompt')).rejects.toThrow(
//         'Failed to generate plain response',
//       );
//     });
//
//     it('should NOT leak the raw upstream error message', async () => {
//       mockChatCompletionsCreate.mockRejectedValueOnce(
//         new Error('secret internal details'),
//       );
//
//       await expect(service.generatePlain('prompt')).rejects.toThrow(
//         'Failed to generate plain response',
//       );
//     });
//   });
//
//   // -------------------------------------------------------------------------
//   // generateStructured
//   // -------------------------------------------------------------------------
//
//   describe('generateStructured', () => {
//     const DiagnosisSchema = z.object({
//       disease: z.string(),
//       confidence: z.number(),
//     });
//
//     it('should return parsed structured data on success', async () => {
//       const parsed = { disease: 'late blight', confidence: 0.92 };
//
//       mockChatCompletionsParse.mockResolvedValueOnce({
//         choices: [{ message: { parsed } }],
//       });
//
//       const result = await service.generateStructured(
//         'Diagnose this plant',
//         DiagnosisSchema,
//       );
//
//       expect(result).toEqual(parsed);
//     });
//
//     it('should pass response_format built from the Zod schema', async () => {
//       mockChatCompletionsParse.mockResolvedValueOnce({
//         choices: [
//           { message: { parsed: { disease: 'rust', confidence: 0.8 } } },
//         ],
//       });
//
//       await service.generateStructured('prompt', DiagnosisSchema);
//
//       expect(mockChatCompletionsParse).toHaveBeenCalledWith(
//         expect.objectContaining({
//           response_format: expect.objectContaining({ type: 'json_schema' }),
//         }),
//       );
//     });
//
//     it('should throw when the model returns null for parsed', async () => {
//       mockChatCompletionsParse.mockResolvedValueOnce({
//         choices: [{ message: { parsed: null } }],
//       });
//
//       await expect(
//         service.generateStructured('prompt', DiagnosisSchema),
//       ).rejects.toThrow('Failed to generate structured response');
//     });
//
//     it('should throw a wrapped error when the OpenAI call fails', async () => {
//       mockChatCompletionsParse.mockRejectedValueOnce(new Error('Rate limit'));
//
//       await expect(
//         service.generateStructured('prompt', DiagnosisSchema),
//       ).rejects.toThrow('Failed to generate structured response');
//     });
//
//     it('should work with a nested Zod schema', async () => {
//       const NestedSchema = z.object({
//         plant: z.object({
//           name: z.string(),
//           diseases: z.array(z.string()),
//         }),
//       });
//
//       const parsed = { plant: { name: 'Tomato', diseases: ['early blight'] } };
//
//       mockChatCompletionsParse.mockResolvedValueOnce({
//         choices: [{ message: { parsed } }],
//       });
//
//       const result = await service.generateStructured('prompt', NestedSchema);
//
//       expect(result).toEqual(parsed);
//     });
//   });
//
//   // -------------------------------------------------------------------------
//   // generatePlainForImage
//   // -------------------------------------------------------------------------
//
//   describe('generatePlainForImage', () => {
//     it('should return output_text on success', async () => {
//       mockResponsesCreate.mockResolvedValueOnce({
//         output_text: 'This leaf has powdery mildew.',
//       });
//
//       const result = await service.generatePlainForImage(
//         'What disease is visible?',
//         makeMockFile(),
//       );
//
//       expect(result).toBe('This leaf has powdery mildew.');
//     });
//
//     it('should encode the image buffer as base64 and embed it in the request', async () => {
//       const imageContent = 'raw-binary-data';
//       const expectedBase64 = Buffer.from(imageContent).toString('base64');
//
//       mockResponsesCreate.mockResolvedValueOnce({ output_text: 'ok' });
//
//       await service.generatePlainForImage(
//         'Describe this image',
//         makeMockFile(imageContent),
//       );
//
//       expect(mockResponsesCreate).toHaveBeenCalledWith(
//         expect.objectContaining({
//           model: 'gpt-4.1-mini',
//           input: [
//             expect.objectContaining({
//               content: expect.arrayContaining([
//                 expect.objectContaining({
//                   type: 'input_image',
//                   image_url: `data:image/jpeg;base64,${expectedBase64}`,
//                 }),
//               ]),
//             }),
//           ],
//         }),
//       );
//     });
//
//     it('should include the text prompt alongside the image', async () => {
//       mockResponsesCreate.mockResolvedValueOnce({ output_text: 'ok' });
//
//       await service.generatePlainForImage('Diagnose', makeMockFile());
//
//       expect(mockResponsesCreate).toHaveBeenCalledWith(
//         expect.objectContaining({
//           input: [
//             expect.objectContaining({
//               content: expect.arrayContaining([
//                 expect.objectContaining({
//                   type: 'input_text',
//                   text: 'Diagnose',
//                 }),
//               ]),
//             }),
//           ],
//         }),
//       );
//     });
//
//     it('should always use the gpt-4.1-mini model, not the configured generation model', async () => {
//       mockResponsesCreate.mockResolvedValueOnce({ output_text: 'ok' });
//
//       await service.generatePlainForImage('prompt', makeMockFile());
//
//       expect(mockResponsesCreate).toHaveBeenCalledWith(
//         expect.objectContaining({ model: 'gpt-4.1-mini' }),
//       );
//     });
//
//     it('should throw a wrapped error when the OpenAI call fails', async () => {
//       mockResponsesCreate.mockRejectedValueOnce(new Error('Upstream error'));
//
//       await expect(
//         service.generatePlainForImage('prompt', makeMockFile()),
//       ).rejects.toThrow('Failed to generate plain response for image');
//     });
//   });
// });
