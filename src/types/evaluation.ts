import type { z } from 'zod';
import type { datasetSchema, caseSchema, answerSchema, reviewSchema, modelSchema, connectionSchema, dimensionSchema } from '../services/validation.js';
export type EvaluationDataset = z.infer<typeof datasetSchema>;
export type EvaluationCase = z.infer<typeof caseSchema>;
export type ModelAnswer = z.infer<typeof answerSchema>;
export type ReviewRecord = z.infer<typeof reviewSchema>;
export type Model = z.infer<typeof modelSchema>;
export type ModelConnection = z.infer<typeof connectionSchema>;
export type ScoringDimension = z.infer<typeof dimensionSchema>;
