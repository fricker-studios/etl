import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { DataPackage } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

const QUERY_KEY = ["packages"];

export function usePackages(params?: { topic_revision?: string }) {
  return useQuery<DataPackage[]>({
    queryKey: params?.topic_revision
      ? [...QUERY_KEY, params.topic_revision]
      : QUERY_KEY,
    queryFn: () => api.packages.list(params) as Promise<DataPackage[]>,
  });
}

export function usePackage(id: string | null) {
  return useQuery<DataPackage>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.packages.get(id!) as Promise<DataPackage>,
    enabled: !!id,
  });
}

export function useCreatePackage() {
  const queryClient = useQueryClient();

  return useMutation<DataPackage, Error, any>({
    mutationFn: (data) => api.packages.create(data) as Promise<DataPackage>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Package created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create package",
        color: "red",
      });
    },
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();

  return useMutation<DataPackage, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) =>
      api.packages.update(id, data) as Promise<DataPackage>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Package updated successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to update package",
        color: "red",
      });
    },
  });
}

export function useDeletePackage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.packages.delete(id) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Package deleted successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to delete package",
        color: "red",
      });
    },
  });
}
