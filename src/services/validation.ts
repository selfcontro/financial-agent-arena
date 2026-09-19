import { z } from 'zod';

const id = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const version = z.number().int().positive();
export const failureLabels = ['数字错误', '单位错误', '引用无效', '使用未来数据', '风险漏报', '无依据买卖建议', '因果关系表述不当'] as const;
export const dimensionSchema = z.object({ dimension_id: id, label: id, weight: z.number().min(0).max(1), enabled: z.boolean(), description: z.string() }).strict();
export const ruleSchema = z.object({ version, dimensions: z.array(dimensionSchema).min(1) }).strict();
export const modelSchema = z.object({ model_id: id, display_name: id, enabled: z.boolean(), base_url: z.url().optional(), model_name: id.optional() }).strict();
// Credentials belong to local connection settings, never portable evaluation datasets.
export const connectionSchema = z.object({ base_url: z.url(), api_key: id, model_name: id }).strict();
export const evidenceSchema = z.object({ evidence_id: id, source_name: id, title: id, published_at: timestamp, content: id, simulated: z.literal(true) }).strict();
export const caseSchema = z.object({
  case_id: id, version, question: id, reference_answer: id,
  reference_values: z.array(z.object({ key: id, label: id, value: z.union([z.number(), z.string()]), unit: z.string(), period: z.string(), note: z.string().optional() }).strict()),
  allowed_evidence: z.array(evidenceSchema).min(1), cutoff_at: timestamp, risk_labels: z.array(z.enum(failureLabels)), simulated: z.literal(true),
}).strict();
export const citationSchema = z.object({ citation_id: id, evidence_id: id.optional(), source_name: id, title: id, published_at: timestamp, excerpt: z.string() }).strict();
export const answerSchema = z.object({ answer_id: id, version, case_id: id, case_version: version, model_id: id, answer: id, citations: z.array(citationSchema), generated_at: timestamp, is_current: z.boolean(), deleted_at: timestamp.optional(), simulated: z.boolean(), connection_snapshot: z.object({ base_url: z.url(), model_name: id }).strict().optional() }).strict();
export const reviewSchema = z.object({
  review_id: id, case_id: id, model_id: id, answer_id: id, answer_version: version, scoring_version: version,
  dimension_scores: z.array(z.object({ dimension_id: id, score: z.number().int().min(0).max(10), label_snapshot: z.string().optional() }).strict()),
  failure_labels: z.array(z.enum(failureLabels)), comment: z.string(), status: z.enum(['unreviewed', 'in_progress', 'completed']),
  created_at: timestamp, updated_at: timestamp, reviewed_at: timestamp.optional(), deleted_at: timestamp.optional(),
}).strict();
const auditSchema = z.object({ event_id: id, entity_type: z.enum(['model','case','answer','review','settings','dataset']), entity_id: id, action: z.enum(['create','update','disable','delete','import','restore']), occurred_at: timestamp, before: z.unknown().optional(), after: z.unknown().optional(), reason: z.string().optional() }).strict();

export const datasetSchema = z.object({
  schema_version: z.literal(1), dataset_id: id, updated_at: timestamp, description: id,
  models: z.array(modelSchema).min(1), cases: z.array(caseSchema).min(1), answers: z.array(answerSchema), reviews: z.array(reviewSchema),
  scoring: ruleSchema, scoring_history: z.array(ruleSchema), failure_labels: z.array(z.enum(failureLabels)), audit_events: z.array(auditSchema),
}).strict().superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (values: (string | number)[], name: string) => { if (new Set(values).size !== values.length) issue(`${name}: duplicate identifier`); };
  const key = (...parts: (string | number)[]) => JSON.stringify(parts);
  unique(data.models.map(x => x.model_id), 'models');
  unique(data.cases.map(x => key(x.case_id,x.version)), 'cases');
  unique(data.answers.map(x => key(x.answer_id,x.version)), 'answers');
  unique(data.answers.filter(x => x.is_current && !x.deleted_at).map(x => key(x.case_id,x.model_id)), 'current answers');
  unique(data.reviews.map(x => x.review_id), 'reviews');
  unique(data.reviews.map(x => key(x.answer_id,x.answer_version)), 'review bindings');
  unique(data.audit_events.map(x => x.event_id), 'audit events');
  unique(data.failure_labels, 'failure labels');
  const rules = [data.scoring, ...data.scoring_history];
  unique(rules.map(x => x.version), 'scoring versions');
  for (const rule of rules) {
    unique(rule.dimensions.map(x => x.dimension_id), 'dimensions');
    const active = rule.dimensions.filter(x => x.enabled);
    if (!active.length || Math.abs(active.reduce((sum,x) => sum+x.weight,0)-1)>1e-9) issue('Enabled weights must sum to 1');
  }
  for (const c of data.cases) {
    unique(c.reference_values.map(x => x.key), 'reference values');
    unique(c.allowed_evidence.map(x => x.evidence_id), 'evidence');
  }
  for (const a of data.answers) {
    if (!data.models.some(m => m.model_id===a.model_id)) issue(`Unknown model: ${a.model_id}`);
    if (!data.cases.some(c => c.case_id===a.case_id && c.version===a.case_version)) issue(`Unknown case version: ${a.answer_id}`);
    unique(a.citations.map(x => x.citation_id), 'citations');
    // Invalid or future citations are intentional evaluation examples, not import errors.
  }
  for (const r of data.reviews) {
    const a = data.answers.find(a => a.answer_id===r.answer_id && a.version===r.answer_version);
    if (!a || a.case_id!==r.case_id || a.model_id!==r.model_id) issue(`Invalid review binding: ${r.review_id}`);
    const rule = rules.find(x => x.version===r.scoring_version);
    if (!rule) issue(`Unknown scoring version: ${r.review_id}`);
    unique(r.dimension_scores.map(x => x.dimension_id), 'review dimensions');
    unique(r.failure_labels, 'review labels');
    if (rule && r.dimension_scores.some(s => !rule.dimensions.some(d => d.dimension_id===s.dimension_id))) issue('Unknown review dimension');
    if (r.status==='completed' && (!r.reviewed_at || rule?.dimensions.some(d => d.enabled && !r.dimension_scores.some(s => s.dimension_id===d.dimension_id)))) issue('Completed review requires all historical dimensions and completion time');
  }
  const checkSecrets = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [k,v] of Object.entries(value)) {
      if (/^(api_?key|authorization)$/i.test(k)) issue('Credentials must not appear in audit snapshots');
      checkSecrets(v);
    }
  };
  checkSecrets(data.audit_events);
});

export function validateDataset(input: unknown) { return datasetSchema.parse(input); }
