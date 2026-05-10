export interface ScreeningMeta {
  task: string;
  target: string;
  classes: [string, string];
  features: string[];
  feature_count: number;
  metrics: {
    cv_accuracy_mean: number;
    cv_accuracy_std: number;
    cv_auc_mean: number;
    cv_auc_std: number;
    holdout_accuracy: number;
    holdout_auc: number;
  };
  training_rows: number;
  model_type: string;
}

export interface ScreeningResult {
  probability: number;
  label: string;
  riskBand: "low" | "moderate" | "high";
}
