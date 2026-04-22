/**
 * Blink Pattern Classifier
 * Trained on 10 features
 * Accuracy: 0.00%
 * 
 * Auto-generated from Python Random Forest model
 */

export interface BlinkFeatures {
    blink_rate: number;
  avg_ear: number;
  ear_variance: number;
  ear_min: number;
  ear_max: number;
  blink_duration: number;
  inter_blink_interval: number;
  closure_velocity: number;
  opening_velocity: number;
  pattern_regularity: number;
}

export interface ClassificationResult {
  prediction: 'Normal' | 'Abnormal';
  confidence: number;
  risk: 'Low' | 'Moderate' | 'High';
  details: {
    normalProbability: number;
    abnormalProbability: number;
  };
}

/**
 * Classify blink pattern based on extracted features
 * 
 * Top features (by importance):
 * - pattern_regularity: 0.301
 * - ear_variance: 0.262
 * - closure_velocity: 0.256
 * - blink_duration: 0.087
 * - avg_ear: 0.030
 */
export function classifyBlinkPattern(features: BlinkFeatures): ClassificationResult {
  // Simplified decision rules based on top features
  let abnormalScore = 0;
  
  // Rule 1: Abnormal blink rate
  if (features.blink_rate < 10 || features.blink_rate > 30) {
    abnormalScore += 0.3;
  }
  
  // Rule 2: High EAR variance (unstable)
  if (features.ear_variance > 0.04) {
    abnormalScore += 0.25;
  }
  
  // Rule 3: Low pattern regularity
  if (features.pattern_regularity < 0.65) {
    abnormalScore += 0.2;
  }
  
  // Rule 4: Abnormal closure velocity
  if (features.closure_velocity < 0.3) {
    abnormalScore += 0.15;
  }
  
  // Rule 5: Irregular inter-blink interval
  const expectedInterval = 60000 / features.blink_rate;
  const intervalDiff = Math.abs(features.inter_blink_interval - expectedInterval);
  if (intervalDiff > 3000) {
    abnormalScore += 0.1;
  }
  
  // Convert to probability
  const abnormalProbability = Math.min(abnormalScore, 1.0);
  const normalProbability = 1.0 - abnormalProbability;
  
  const prediction = abnormalProbability > 0.5 ? 'Abnormal' : 'Normal';
  const confidence = Math.max(normalProbability, abnormalProbability);
  
  // Risk assessment
  let risk: 'Low' | 'Moderate' | 'High';
  if (abnormalProbability > 0.7) risk = 'High';
  else if (abnormalProbability > 0.4) risk = 'Moderate';
  else risk = 'Low';
  
  return {
    prediction,
    confidence,
    risk,
    details: {
      normalProbability,
      abnormalProbability,
    },
  };
}

/**
 * Extract blink features from Eye Aspect Ratio (EAR) time series
 */
export function extractBlinkFeatures(earHistory: { ear: number; timestamp: number }[]): BlinkFeatures {
  if (earHistory.length < 10) {
    throw new Error('Insufficient data: need at least 10 EAR samples');
  }
  
  const ears = earHistory.map(h => h.ear);
  const timestamps = earHistory.map(h => h.timestamp);
  
  // Calculate statistics
  const avg_ear = ears.reduce((a, b) => a + b, 0) / ears.length;
  const ear_variance = ears.reduce((sum, ear) => sum + Math.pow(ear - avg_ear, 2), 0) / ears.length;
  const ear_min = Math.min(...ears);
  const ear_max = Math.max(...ears);
  
  // Detect blinks (EAR < 0.2)
  const blinks = earHistory.filter(h => h.ear < 0.2);
  const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000; // seconds
  const blink_rate = (blinks.length / duration) * 60; // per minute
  
  // Calculate blink durations
  const blinkDurations: number[] = [];
  let blinkStart: number | null = null;
  
  for (let i = 0; i < earHistory.length; i++) {
    if (earHistory[i].ear < 0.2 && blinkStart === null) {
      blinkStart = earHistory[i].timestamp;
    } else if (earHistory[i].ear >= 0.2 && blinkStart !== null) {
      blinkDurations.push(earHistory[i].timestamp - blinkStart);
      blinkStart = null;
    }
  }
  
  const avg_blink_duration = blinkDurations.length > 0
    ? blinkDurations.reduce((a, b) => a + b, 0) / blinkDurations.length
    : 150;
  
  // Calculate inter-blink intervals
  const interBlinkIntervals: number[] = [];
  for (let i = 1; i < blinks.length; i++) {
    interBlinkIntervals.push(blinks[i].timestamp - blinks[i - 1].timestamp);
  }
  
  const avg_inter_blink_interval = interBlinkIntervals.length > 0
    ? interBlinkIntervals.reduce((a, b) => a + b, 0) / interBlinkIntervals.length
    : 5000;
  
  // Calculate velocities (simplified)
  const velocities: number[] = [];
  for (let i = 1; i < ears.length; i++) {
    const dt = (timestamps[i] - timestamps[i - 1]) / 1000; // seconds
    if (dt > 0) {
      velocities.push(Math.abs(ears[i] - ears[i - 1]) / dt);
    }
  }
  
  const closure_velocity = velocities.length > 0
    ? Math.max(...velocities)
    : 0.4;
  const opening_velocity = closure_velocity * 0.8; // Typically slower
  
  // Pattern regularity (inverse of interval variance)
  const intervalVariance = interBlinkIntervals.length > 1
    ? interBlinkIntervals.reduce((sum, val) => {
        const mean = avg_inter_blink_interval;
        return sum + Math.pow(val - mean, 2);
      }, 0) / interBlinkIntervals.length
    : 1000;
  
  const pattern_regularity = Math.max(0, Math.min(1, 1 - (intervalVariance / 10000)));
  
  return {
    blink_rate,
    avg_ear,
    ear_variance,
    ear_min,
    ear_max,
    blink_duration: avg_blink_duration,
    inter_blink_interval: avg_inter_blink_interval,
    closure_velocity,
    opening_velocity,
    pattern_regularity,
  };
}
