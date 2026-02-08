import { useQuery } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { Run } from "../store/useAppStore";

const QUERY_KEY = ["runs"];

export function useRuns() {
  return useQuery<Run[]>({
    queryKey: QUERY_KEY,
    queryFn: () => api.runs.list() as Promise<Run[]>,
  });
}

export function useRun(id: string | null) {
  return useQuery<Run>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.runs.get(id!) as Promise<Run>,
    enabled: !!id,
  });
}
