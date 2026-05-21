# Cogni — Improvement Suggestions (Presentation Prep)

> Honest gaps and upgrade paths, mapped to the rubric criteria.
> Use these to preempt judge questions and demonstrate self-awareness.

---

## A. Technical Gaps (Rubric B: Technical Soundness)

### 1. MRI Model — Kaggle Augmentation Leakage
**Problem**: The `alzheimer_mri` model (PCA → MLP, 78.2% accuracy) was trained and tested on the same Kaggle dataset where augmented images from the same patient appear in both splits. This means the 78.2% test accuracy is inflated; the true OOD performance is unknown.
**Presenter Move**: Acknowledge this proactively. Say "we flag this as a demo artefact, not a clinical tool." Show you understand why it matters (patient-level data leakage is a known pitfall in medical imaging).
**Fix Path**: Use patient-level GroupKFold or an independent dataset (ADNI, AIBL). The OASIS model already does this correctly (GroupKFold by subject ID) — cite that as the contrast.

### 2. WebSocket Fan-Out — Single-Replica Bottleneck
**Problem**: The in-process pub/sub hub (`ws_hub.py`) only scales to one Hugging Face Space replica. If the process restarts, all subscriptions are lost. Production requires Redis Pub/Sub or a message broker.
**Presenter Move**: Mention this as a known infrastructure limitation. Judges who ask "how does this scale?" deserve a honest answer: it works for demos, Redis Streams needed for real deployment.
**Fix Path**: Add `redis-py` async driver, route `patient:{id}` topics through a Redis channel. ~2 days of work.

### 3. PII Column Encryption — Designed but Not Deployed
**Problem**: `docs/security.md` documents a Fernet-based PII encryption scheme for columns like `full_name`, `allergies`, `medical_notes`, `home_address`. This is not yet implemented in the actual models or migrations.
**Presenter Move**: Frame it as "we have a documented security roadmap, and our threat model explicitly identifies this gap." This shows maturity without overclaiming.
**Fix Path**: Add `EncryptedType` wrapper from `sqlalchemy-utils` or a before-insert event hook using `cryptography.fernet`. Migrations would add `_enc` columns.

### 4. Risk Thresholds — Heuristic, Not Validated
**Problem**: Gait classification thresholds (e.g., `verticalLift = 0.24`, `shuffling zStd < 0.2`) and smooth-pursuit risk thresholds are hand-tuned constants, not derived from clinical literature.
**Presenter Move**: Say explicitly: "Our gait risk scores are signals for caregivers to investigate, not diagnostic outputs." Distinguish between "clinical-grade" and "early-warning indicator."
**Fix Path**: Reference published gait studies (e.g., Hausdorff et al. on stride variability in dementia) and align thresholds. Collect real user data to validate.

### 5. No Out-of-Band Alert Delivery
**Problem**: Anomaly alerts (fall detected, wandering) are only surfaced inside the web app. If the caregiver isn't looking at the dashboard, they won't know.
**Presenter Move**: Acknowledge: "We have a prioritized roadmap item for SMS/push notifications via Twilio or FCM. In the current demo, alerts are real-time when the caregiver has the app open."
**Fix Path**: Add Celery task or background asyncio task to call Twilio/SendGrid on `severity=danger` alerts. 1–2 days of work.

### 6. Offline/Connectivity Robustness
**Problem**: TanStack Query caches reads but POSTs (game session, pursuit result, alert creation) are lost if the patient device goes offline mid-session.
**Fix Path**: Add an offline queue (IndexedDB + sync-on-reconnect pattern) for telemetry writes. Service worker background sync.

---

## B. Data & Model Gaps (Rubric D: Dataset Choice)

### 7. OASIS Model — Small Dataset (373 rows, 150 subjects)
**Problem**: 373 rows across 150 subjects is small by modern ML standards. The "holdout perfect" AUC (1.0) suggests overfitting on the holdout split.
**Presenter Move**: Emphasize what was done right: GroupKFold cross-validation by subject ID prevents data leakage. The CV AUC (0.877) is the honest number. Acknowledge sample size as a limitation.
**Fix Path**: Incorporate OASIS-3 (1,098 subjects, longitudinal) or ADNI (800+ participants, multi-site).

### 8. Agitation Model — High Imbalance (4.2% Positive Rate)
**Problem**: The `adresso_agitation` model has 2,722 rows but only 114 positives (4.2%). Despite `SqrtBalanced` class weighting, evaluation at default threshold is misleading (AUC 0.80 vs CV accuracy 94% — the accuracy is inflated by always predicting "no agitation").
**Presenter Move**: When discussing this model, always cite AUC (0.80–0.885), not accuracy (94%). Explain that you use CatBoost's class balancing precisely because of this imbalance.

### 9. Singapore-Specific Data Absence
**Problem**: None of the four models were trained on Singapore or Southeast Asian populations. Ethnicity is a feature in `alzheimer_tabular` but the training distribution is not specified.
**Presenter Move**: This is a real gap — say so. "Our models are trained on Western/US datasets. Singapore's multi-ethnic population (Chinese, Malay, Indian) may have different disease trajectories, and localising the models is a key next step."
**Fix Path**: Partner with NUH/NUHS/SGH or use Singapore's National Registry of Rare Diseases datasets if available.

### 10. No Longitudinal Tracking / Decline Velocity
**Problem**: The Trends scene plots scores over time but doesn't compute a regression line or alert on statistically significant decline. Caregiver has to visually eyeball trends.
**Fix Path**: Add a simple linear regression slope per game over the last 30 sessions. Alert if slope is significantly negative (e.g., |slope| > 1 SD from historical baseline).

---

## C. Usability & Experience Gaps (Rubric C: Scalability)

### 11. Caregiver Alert Volume — No Grouping or Prioritisation
**Problem**: The alerts panel shows a flat list. If multiple alerts fire in quick succession (gait + location + vision), it becomes overwhelming.
**Fix Path**: Group alerts by module (Gait, Location, Vision). Add a "critical only" filter. Show alert counts by severity in the Overview header.

### 12. Eye-Tracking Calibration — Requires Stable Setup
**Problem**: The 9-point calibration and smooth-pursuit test require the patient to sit still ~60 cm from the camera in good lighting. Patients with advanced dementia cannot reliably perform this.
**Presenter Move**: Target population is MCI (mild cognitive impairment) or early-stage dementia, not advanced-stage. Be explicit about this.

### 13. Cognitive Games — No Adaptive Difficulty Ramping
**Problem**: Each game session starts at the same difficulty (span = 3 for SequenceRecall). There's no cross-session memory of the patient's last performance to set a personalised baseline.
**Fix Path**: Persist the last `memory_span` to a per-patient setting and initialize the next session there.

### 14. Geofence Zone UI — No Mobile-Friendly Polygon Drawing
**Problem**: Drawing polygon zones requires map click events. On mobile, polygon drawing may be imprecise (small touch targets).
**Fix Path**: Add a "draw circle" mode (radius + center) as an alternative to polygon for mobile caregivers.

---

## D. Deployment & Operational Gaps (Rubric C: Deployment)

### 15. Hugging Face Spaces — Free Tier Cold Starts
**Problem**: HF Spaces free tier idles after inactivity. The backend has a DB keep-alive ping (every 4 min) but not a self-keep-alive HTTP ping.
**Fix Path**: Add a GitHub Actions cron to ping `/health` every 4 minutes, or upgrade to HF Pro.

### 16. No Automated Testing
**Problem**: No unit tests, integration tests, or API tests were found in the codebase. The demo/verification docs exist but tests are manual.
**Presenter Move**: Acknowledge this. "We prioritised rapid iteration; a production deployment would require a test suite covering auth flows, pairing logic, and ML inference."
**Fix Path**: Add pytest + httpx async test client for FastAPI. Add vitest for frontend hooks.

### 17. OpenStreetMap Tiles — Not Production-Grade
**Problem**: OpenStreetMap tiles are fetched from free CDN. ToS restricts heavy/commercial use.
**Fix Path**: Use Mapbox, MapTiler, or Singapore's OneMap API (OneMap is the official Singapore government mapping service — especially appropriate given Singapore context).

---

## E. Ethical & Responsible AI Gaps (Rubric D: Responsible AI)

### 18. No Consent or Data Governance UI
**Problem**: There's no explicit informed-consent flow when a patient account is created. No terms of service, no data retention policy UI, no PDPA compliance notice (Singapore Personal Data Protection Act).
**Presenter Move**: Mention PDPA compliance as a necessary step before real deployment.
**Fix Path**: Add a consent checkbox at signup with data usage explanation. Add a "delete my data" button (DELETE /auth/me exists at the API level but may not be surfaced clearly in UI).

### 19. Model Explainability — No Feature Attribution Shown
**Problem**: The screening result cards show probability and band but no explanation of which features drove the prediction.
**Fix Path**: Use SHAP values (already supported by LightGBM/CatBoost). Display the top 5 contributing features to the caregiver alongside each screening result.

### 20. No Audit Log for Clinical Decisions
**Problem**: There's no record of who ran a screening, what inputs were used, and what decision was made. The `screening_results` table stores `inputs_json`, which is good, but there's no caregiver-facing audit view.
**Fix Path**: Add a `screening_results` history tab in the Screening scene with downloadable CSV export.

---

## Priority Stack-Rank for Judges

| Priority | Gap | Why It Matters |
|----------|-----|---------------|
| 1 | MRI model leakage (acknowledge) | Judges will ask about test accuracy |
| 2 | Singapore-specific data (acknowledge) | Rubric explicitly checks Singapore context |
| 3 | PII encryption roadmap | Privacy/PDPA question likely |
| 4 | Out-of-band alerts roadmap | "What if caregiver is asleep?" question |
| 5 | Model explainability roadmap | Responsible AI rubric item |
| 6 | No automated tests (acknowledge) | Technical soundness rubric |
