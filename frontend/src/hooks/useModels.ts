import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { Model } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

const QUERY_KEY = ["models"];

export function useModels() {
  return useQuery<Model[]>({
    queryKey: QUERY_KEY,
    queryFn: () => api.models.list() as Promise<Model[]>,
  });
}

export function useModel(id: string | null) {
  return useQuery<Model>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.models.get(id!) as Promise<Model>,
    enabled: !!id,
  });
}

export function useCreateModel() {
  const queryClient = useQueryClient();

  return useMutation<Model, Error, any>({
    mutationFn: (data) => api.models.create(data) as Promise<Model>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Model created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create model",
        color: "red",
      });
    },
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();

  return useMutation<Model, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) =>
      api.models.update(id, data) as Promise<Model>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Model updated successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to update model",
        color: "red",
      });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.models.delete(id) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Model deleted successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to delete model",
        color: "red",
      });
    },
  });
}
