import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../utils/api";
import type { Topic } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

const TOPICS_QUERY_KEY = ["topics"];
const REVISIONS_QUERY_KEY = ["topicRevisions"];

export function useTopics() {
  return useQuery<Topic[]>({
    queryKey: TOPICS_QUERY_KEY,
    queryFn: () => api.topics.list() as Promise<Topic[]>,
  });
}

export function useTopic(id: string | null) {
  return useQuery<Topic>({
    queryKey: [...TOPICS_QUERY_KEY, id],
    queryFn: () => api.topics.get(id!) as Promise<Topic>,
    enabled: !!id,
  });
}

export function useCreateTopic() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { topic: any; schema: any[] }
  >({
    mutationFn: async ({ topic, schema }) => {
      const createdTopic = (await api.topics.create(topic)) as Topic;
      const revisionData = {
        topic: createdTopic.id,
        revision_number: 1,
        schema: schema,
        change_description: "Initial schema",
      };
      await api.topicRevisions.create(revisionData);
      return String(createdTopic.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REVISIONS_QUERY_KEY });
      notifications.show({
        message: "Topic created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create topic",
        color: "red",
      });
    },
  });
}

export function useUpdateTopic() {
  const queryClient = useQueryClient();

  return useMutation<Topic, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) =>
      api.topics.update(id, data) as Promise<Topic>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
      notifications.show({
        message: "Topic updated successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to update topic",
        color: "red",
      });
    },
  });
}

export function useDeleteTopic() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.topics.delete(id) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
      notifications.show({
        message: "Topic deleted successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to delete topic",
        color: "red",
      });
    },
  });
}

export function useCreateTopicRevision() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, any>({
    mutationFn: (data) => api.topicRevisions.create(data) as Promise<void>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: REVISIONS_QUERY_KEY });
      notifications.show({
        message: "Topic revision created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create topic revision",
        color: "red",
      });
    },
  });
}
