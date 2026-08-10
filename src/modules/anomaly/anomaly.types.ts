export type AnomalyType =
  | "request_spike" // Sudden 10x volume increase
  | "off_hours_usage" // Requests between 1AM–5AM UTC
  | "expensive_request" // Single request cost > threshold
  | "rapid_spend"; // Hourly spend > daily average

export type AnomalySeverity = "low" | "medium" | "high";

export type AnomalyAlert = {
  type: AnomalyType;
  apiKeyId: string;
  userId: string;
  severity: AnomalySeverity;
  detail: string;
  detectedAt: Date;
  metadata: Record<string, unknown>;
};
