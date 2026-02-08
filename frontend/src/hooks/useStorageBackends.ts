import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { StorageBackend } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

const QUERY_KEY = ["storageBackends"];

export function useStorageBackends() {
  return useQuery<StorageBackend[]>({
    queryKey: QUERY_KEY,
    queryFn: () => api.storageBackends.list() as Promise<StorageBackend[]>,
  });
}

export function useStorageBackend(id: string | null) {
  return useQuery<StorageBackend>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.storageBackends.get(id!) as Promise<StorageBackend>,
    enabled: !!id,
  });
}

export function useCreateStorageBackend() {
  const queryClient = useQueryClient();

  return useMutation<StorageBackend, Error, any>({
    mutationFn: (data) =>
      api.storageBackends.create(data) as Promise<StorageBackend>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Storage backend created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create storage backend",
        color: "red",
      });
    },
  });
}

export function useUpdateStorageBackend() {
  const queryClient = useQueryClient();

  return useMutation<StorageBackend, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) =>
      api.storageBackends.update(id, data) as Promise<StorageBackend>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Storage backend updated successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to update storage backend",
        color: "red",
      });
    },
  });
}

export function useDeleteStorageBackend() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.storageBackends.delete(id) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Storage backend deleted successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to delete storage backend",
        color: "red",
      });
    },
  });
}
