import { useQuery } from "@tanstack/react-query";
import { api } from "../utils/api";

export interface TransformationFunction {
  name: string;
  params: string[];
  example: string;
  description: string;
}

export interface TransformationCategory {
  description: string;
  functions: TransformationFunction[];
}

export interface TransformationsResponse {
  String: TransformationCategory;
  Numeric: TransformationCategory;
  DateTime: TransformationCategory;
  "Type Casting": TransformationCategory;
  Conditional: TransformationCategory;
  Hash: TransformationCategory;
}

export function useTransformations() {
  return useQuery<TransformationsResponse>({
    queryKey: ["transformations"],
    queryFn: () => api.transformations.list(),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour since transformations don't change often
  });
}
