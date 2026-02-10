import { create } from "zustand";
import { api } from "../utils/api";

export type StorageBackend =
  | {
      id: string;
      kind: "s3";
      name: string;
      endpoint: string;
      region?: string;
      bucket: string;
      access_key_id: string;
      secret_access_key: string;
      path_style: boolean;
      tls_verify: boolean;
    }
  | {
      id: string;
      kind: "clickhouse";
      name: string;
      mode: "single" | "cluster";
      hosts: { host: string; port: number }[];
      database: string;
      username: string;
      password: string;
      secure: boolean;
    };

export type DataSource = {
  id: string;
  name: string;
  type: "api" | "database" | "s3" | "sftp";

  // API fields
  base_url?: string;
  auth_type?: "none" | "bearer" | "basic" | "header" | "ssh_key";
  bearer_token?: string;
  basic_user?: string;
  basic_pass?: string;
  header_name?: string;
  header_value?: string;

  // Database fields
  database_type?: "postgresql" | "mysql" | "mongodb" | "sqlserver" | "oracle";
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
  password?: string;

  // S3 fields
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key?: string;
  s3_secret_key?: string;

  // SFTP fields
  sftp_host?: string;
  sftp_port?: number;
  sftp_username?: string;
  sftp_password?: string;
  sftp_key?: string;
};

export type Pagination =
  | { type: "none" }
  | {
      type: "page";
      pageParam: string;
      sizeParam?: string;
      pageStart: number;
      pageSize?: number;
    }
  | { type: "cursor"; cursorParam: string; cursorPathInResponse: string }
  | { type: "cursor_url"; cursorParam: string; cursorUrlPathInResponse: string };

export type Stream = {
  id: string;
  data_source: string;
  topic?: string;
  name: string;
  source_object: any; // Flexible structure for different source types

  // API-specific fields (for backward compatibility)
  method?: "GET" | "POST";
  path?: string;
  query_params: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  body_template?: string;
  pagination: Pagination;

  // Database-specific fields
  table_name?: string;
  ingestion_strategy?: "full_refresh" | "incremental" | "snapshot";
  incremental_key?: string;

  // S3-specific fields
  s3_path_pattern?: string;
  s3_file_format?: string;

  // SFTP-specific fields
  sftp_path_pattern?: string;
  sftp_file_format?: string;

  // Scheduling
  schedule_enabled?: boolean;
  schedule_cron?: string;
  schedule_interval_minutes?: number;

  // Preview and schema (for API sources)
  preview_json?: unknown;
  inferred_schema?: unknown;
  records_selector?: string; // JSON path to extract records, e.g., "data" or "results"
};

export type TopicRevision = {
  id: string;
  topic: string;
  revision_number: number;
  schema: Array<{
    name: string;
    position: number;
    data_type: string;
    nullable: boolean;
  }>;
  change_description?: string;
  package_count?: number;
  created_at: string;
};

export type Topic = {
  id: string;
  name: string;
  description?: string;
  revisions?: TopicRevision[];
  current_revision?: TopicRevision;
  total_packages?: number;
  created_at: string;
  updated_at: string;
};

export type DataPackage = {
  id: string;
  name: string;
  topic_revision: string;
  topic_name?: string;
  revision_number?: number;
  stream?: string;
  created_at: string;
  destination?: string;
  row_count_estimate?: number;
  file_path?: string;
  file_size_bytes?: number;
  status: "draft" | "queued" | "materialized" | "failed";
};

export type Model =
  | {
      id: string;
      name: string;
      type: "data_vault";
      packages: string[];
      hubs: { name: string; businessKey: string }[];
      links: { name: string; hubs: string[] }[];
      satellites: { name: string; parent: string; attributes: string[] }[];
    }
  | {
      id: string;
      name: string;
      type: "dimensional";
      packages: string[];
      facts: {
        name: string;
        grain: string;
        measures: string[];
        dimensions: string[];
      }[];
      dimensions: { name: string; key: string; attributes: string[] }[];
    };

export type Run = {
  id: string;
  name: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  stream?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  rows_processed?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
};

type AppState = {
  storageBackends: StorageBackend[];
  dataSources: DataSource[];
  streams: Stream[];
  topics: Topic[];
  packages: DataPackage[];
  models: Model[];
  runs: Run[];
  loading: boolean;

  fetchAll: () => Promise<void>;

  addStorageBackend: (b: any) => Promise<void>;
  removeStorageBackend: (id: string) => Promise<void>;

  upsertDataSource: (s: any) => Promise<void>;
  removeDataSource: (id: string) => Promise<void>;

  upsertStream: (s: any) => Promise<void>;
  removeStream: (id: string) => Promise<void>;
  setStreamPreview: (
    id: string,
    previewJson: unknown,
    inferredSchema: unknown,
  ) => Promise<void>;

  addTopic: (topic: any, schema: any[]) => Promise<string | null>;
  addTopicRevision: (revision: any) => Promise<void>;
  removeTopic: (id: string) => Promise<void>;

  addPackage: (p: any) => Promise<void>;
  updatePackage: (id: string, patch: Partial<DataPackage>) => Promise<void>;

  upsertModel: (m: any) => Promise<void>;
  removeModel: (id: string) => Promise<void>;

  resetAll: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  storageBackends: [],
  dataSources: [],
  streams: [],
  topics: [],
  packages: [],
  models: [],
  runs: [],
  loading: false,

  fetchAll: async () => {
    console.log("[useAppStore] fetchAll: Starting data fetch...");
    set({ loading: true });
    try {
      console.log("[useAppStore] fetchAll: Calling API endpoints...");
      const [
        storageBackends,
        dataSources,
        streams,
        topics,
        packages,
        models,
        runs,
      ] = await Promise.all([
        api.storageBackends.list() as Promise<StorageBackend[]>,
        api.dataSources.list() as Promise<DataSource[]>,
        api.streams.list() as Promise<Stream[]>,
        api.topics.list() as Promise<Topic[]>,
        api.packages.list() as Promise<DataPackage[]>,
        api.models.list() as Promise<Model[]>,
        api.runs.list() as Promise<Run[]>,
      ]);
      console.log("[useAppStore] fetchAll: API responses received:", {
        storageBackends: storageBackends.length,
        dataSources: dataSources.length,
        streams: streams.length,
        topics: topics.length,
        packages: packages.length,
        models: models.length,
        runs: runs.length,
      });
      console.log("[useAppStore] fetchAll: Storage backends data:", storageBackends);
      set({
        storageBackends,
        dataSources,
        streams,
        topics,
        packages,
        models,
        runs,
      });
      console.log("[useAppStore] fetchAll: State updated successfully");
    } catch (error) {
      console.error("[useAppStore] fetchAll: Failed to fetch data:", error);
    } finally {
      set({ loading: false });
      console.log("[useAppStore] fetchAll: Loading complete");
    }
  },

  addStorageBackend: async (b) => {
    const created = (await api.storageBackends.create(b)) as StorageBackend;
    set((st) => ({ storageBackends: [...st.storageBackends, created] }));
  },

  removeStorageBackend: async (id) => {
    await api.storageBackends.delete(id);
    set((st) => ({
      storageBackends: st.storageBackends.filter((x) => x.id !== id),
    }));
  },

  upsertDataSource: async (s) => {
    if (s.id) {
      const updated = (await api.dataSources.update(s.id, s)) as DataSource;
      set((st) => ({
        dataSources: st.dataSources.map((x) => (x.id === s.id ? updated : x)),
      }));
    } else {
      const created = (await api.dataSources.create(s)) as DataSource;
      set((st) => ({ dataSources: [...st.dataSources, created] }));
    }
  },

  removeDataSource: async (id) => {
    await api.dataSources.delete(id);
    set((st) => ({
      dataSources: st.dataSources.filter((x) => x.id !== id),
    }));
  },

  upsertStream: async (s) => {
    if (s.id) {
      const updated = (await api.streams.update(s.id, s)) as Stream;
      set((st) => ({
        streams: st.streams.map((x) => (x.id === s.id ? updated : x)),
      }));
    } else {
      const created = (await api.streams.create(s)) as Stream;
      set((st) => ({ streams: [...st.streams, created] }));
    }
  },

  removeStream: async (id) => {
    await api.streams.delete(id);
    set((st) => ({
      streams: st.streams.filter((x) => x.id !== id),
    }));
  },

  setStreamPreview: async (id, previewJson, inferredSchema) => {
    const updated = (await api.streams.update(id, {
      preview_json: previewJson,
      inferred_schema: inferredSchema,
    })) as Stream;
    set((st) => ({
      streams: st.streams.map((x) => (x.id === id ? updated : x)),
    }));
  },

  addTopic: async (topic, schema) => {
    try {
      // Create the topic first
      const createdTopic = (await api.topics.create(topic)) as Topic;

      // Then create the initial revision with schema
      const revisionData = {
        topic: createdTopic.id,
        revision_number: 1,
        schema: schema,
        change_description: "Initial schema",
      };

      await api.topicRevisions.create(revisionData);

      // Fetch the updated topic with revisions
      const updatedTopic = (await api.topics.get(
        String(createdTopic.id),
      )) as Topic;

      set((st) => ({ topics: [...st.topics, updatedTopic] }));

      return String(createdTopic.id);
    } catch (error) {
      console.error("Failed to create topic:", error);
      throw error;
    }
  },

  addTopicRevision: async (revision) => {
    try {
      await api.topicRevisions.create(revision);

      // Fetch the updated topic with new revision
      const updatedTopic = (await api.topics.get(
        String(revision.topic),
      )) as Topic;

      set((st) => ({
        topics: st.topics.map((t) =>
          t.id === revision.topic ? updatedTopic : t
        ),
      }));
    } catch (error) {
      console.error("Failed to create topic revision:", error);
      throw error;
    }
  },

  removeTopic: async (id) => {
    await api.topics.delete(id);
    set((st) => ({
      topics: st.topics.filter((x) => x.id !== id),
    }));
  },

  addPackage: async (p) => {
    const created = (await api.packages.create(p)) as DataPackage;
    set((st) => ({ packages: [...st.packages, created] }));
  },

  updatePackage: async (id, patch) => {
    const updated = (await api.packages.update(id, patch)) as DataPackage;
    set((st) => ({
      packages: st.packages.map((x) => (x.id === id ? updated : x)),
    }));
  },

  upsertModel: async (m) => {
    if ((m as any).id) {
      const updated = (await api.models.update((m as any).id, m)) as Model;
      set((st) => ({
        models: st.models.map((x) =>
          (x as any).id === (m as any).id ? updated : x,
        ),
      }));
    } else {
      const created = (await api.models.create(m)) as Model;
      set((st) => ({ models: [...st.models, created] }));
    }
  },

  removeModel: async (id) => {
    await api.models.delete(id);
    set((st) => ({
      models: st.models.filter((x: any) => (x as any).id !== id),
    }));
  },

  resetAll: () => {
    set({
      storageBackends: [],
      dataSources: [],
      streams: [],
      topics: [],
      packages: [],
      models: [],
      runs: [],
    });
  },
}));
