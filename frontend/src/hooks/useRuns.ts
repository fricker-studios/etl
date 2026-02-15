import { useQuery } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { Run } from "../store/useAppStore";

const QUERY_KEY = ["runs"];

interface RunsResponse {
  results: Run[];
  pagination: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

export function useRuns(page?: number, perPage?: number) {
  return useQuery<RunsResponse>({
    queryKey: [...QUERY_KEY, page, perPage],
    queryFn: () => api.runs.list(page, perPage) as Promise<RunsResponse>,
  });
}

export function useRun(id: string | null) {
  return useQuery<Run>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.runs.get(id!) as Promise<Run>,
    enabled: !!id,
  });
}
