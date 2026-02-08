import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { Stream } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

const QUERY_KEY = ["streams"];

export function useStreams() {
  return useQuery<Stream[]>({
    queryKey: QUERY_KEY,
    queryFn: () => api.streams.list() as Promise<Stream[]>,
  });
}

export function useStream(id: string | null) {
  return useQuery<Stream>({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => api.streams.get(id!) as Promise<Stream>,
    enabled: !!id,
  });
}

export function useCreateStream() {
  const queryClient = useQueryClient();

  return useMutation<Stream, Error, any>({
    mutationFn: (data) => api.streams.create(data) as Promise<Stream>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Stream created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create stream",
        color: "red",
      });
    },
  });
}

export function useUpdateStream() {
  const queryClient = useQueryClient();

  return useMutation<Stream, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) =>
      api.streams.update(id, data) as Promise<Stream>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Stream updated successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to update stream",
        color: "red",
      });
    },
  });
}

export function useDeleteStream() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.streams.delete(id) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifications.show({
        message: "Stream deleted successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to delete stream",
        color: "red",
      });
    },
  });
}

export function useExecuteStream() {
  const queryClient = useQueryClient();

  return useMutation<{ packages_created: number }, Error, string>({
    mutationFn: (id) =>
      api.streams.execute(id) as Promise<{ packages_created: number }>,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      notifications.show({
        message: `${result.packages_created || 0} data package(s) created`,
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to execute stream",
        color: "red",
      });
    },
  });
}
