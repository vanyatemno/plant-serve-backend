export interface MlTopPrediction {
  label: string;
  confidence: number;
  class_id: number;
}

export interface MlServiceResponse {
  prediction: string;
  confidence: number;
  class_id: number;
  is_healthy: boolean;
  plant_type: string;
  top_predictions: MlTopPrediction[];
}
