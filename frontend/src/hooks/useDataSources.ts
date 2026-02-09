import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { DataSource } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

const QUERY_KEY = ["dataSources"];

export function useDataSources() {
  return useQuery<DataSource[]>({
    queryKey: QUERY_KEY,
    queryFn: () => api.dataSources.list() as Promise<DataSource[]>,
  });
}

export function useDataSource(id: string | null) {
  return useQuery<DataSource>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.dataSources.get(id!) as Promise<DataSource>,
    enabled: !!id,
  });
}

export function useCreateDataSource() {
  const queryClient = useQueryClient();

  return useMutation<DataSource, Error, any>({
    mutationFn: (data) => api.dataSources.create(data) as Promise<DataSource>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Data source created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create data source",
        color: "red",
      });
    },
  });
}

export function useUpdateDataSource() {
  const queryClient = useQueryClient();

  return useMutation<DataSource, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) =>
      api.dataSources.update(id, data) as Promise<DataSource>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Data source updated successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to update data source",
        color: "red",
      });
    },
  });
}

export function useDeleteDataSource() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.dataSources.delete(id) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Data source deleted successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to delete data source",
        color: "red",
      });
    },
  });
}
