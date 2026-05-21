export type ModelKey =
  | "alzheimer_tabular"
  | "dementia_oasis"
  | "adresso_agitation"
  | "alzheimer_mri";

export interface ModelMeta {
  task: string;
  target?: string;
  classes: string[];
  features: string[];
  feature_count: number;
  metrics: Record<string, number>;
  training_rows: number;
  model_type: string;
  imputation_values?: Record<string, number>;
  missing_value_fill?: number;
  caveats?: string[];
  /** Sorted descending. `importance_pct` is the model's
   *  feature_importances_ normalised to sum to 100. Populated by the
   *  one-off `dump_feature_importances.py` script at training time. */
  feature_importances?: { name: string; importance_pct: number }[];
}

export type RiskBand = "low" | "moderate" | "high";

export interface BinaryResult {
  kind: "binary";
  probability: number; // P(positive class)
  label: string;
  riskBand: RiskBand;
}

export interface MulticlassResult {
  kind: "multiclass";
  probs: number[];
  topIndex: number;
  topLabel: string;
  topProb: number;
}

export type InferenceResult = BinaryResult | MulticlassResult;
