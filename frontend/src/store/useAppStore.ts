import { create } from "zustand";
import { nanoid } from "nanoid/non-secure";
import { loadJson, saveJson } from "../utils/storage";

export type StorageBackend =
  | {
      id: string;
      kind: "s3";
      name: string;
      endpoint: string;
      region?: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      pathStyle: boolean;
      tlsVerify: boolean;
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

export type ApiSource = {
  id: string;
  name: string;
  baseUrl: string;
  authType: "none" | "bearer" | "basic" | "header";
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  headerName?: string;
  headerValue?: string;
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
  | { type: "cursor"; cursorParam: string; cursorPathInResponse: string };

export type Stream = {
  id: string;
  apiSourceId: string;
  name: string;
  method: "GET" | "POST";
  path: string; // /v1/items
  queryParams: { key: string; value: string }[];
  headers: { key: string; value: string }[];
  bodyTemplate?: string;
  pagination: Pagination;
  previewJson?: unknown; // stored sample response
  inferredSchema?: unknown; // stored schema
};

export type DataPackage = {
  id: string;
  name: string;
  streamId: string;
  createdAt: string;
  destinationId?: string; // storage backend chosen
  rowCountEstimate?: number;
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

type AppState = {
  storageBackends: StorageBackend[];
  apiSources: ApiSource[];
  streams: Stream[];
  packages: DataPackage[];
  models: Model[];

  addStorageBackend: (b: Omit<StorageBackend, "id">) => void;
  removeStorageBackend: (id: string) => void;

  upsertApiSource: (s: Omit<ApiSource, "id"> & { id?: string }) => void;
  removeApiSource: (id: string) => void;

  upsertStream: (s: Omit<Stream, "id"> & { id?: string }) => void;
  removeStream: (id: string) => void;
  setStreamPreview: (
    id: string,
    previewJson: unknown,
    inferredSchema: unknown,
  ) => void;

  addPackage: (p: Omit<DataPackage, "id" | "createdAt" | "status">) => void;
  updatePackage: (id: string, patch: Partial<DataPackage>) => void;

  upsertModel: (m: Omit<Model, "id"> & { id?: string }) => void;
  removeModel: (id: string) => void;

  resetAll: () => void;
};

const KEY = "etl_ui_state_v1";

const initial = loadJson<
  Pick<
    AppState,
    "storageBackends" | "apiSources" | "streams" | "packages" | "models"
  >
>(KEY, {
  storageBackends: [],
  apiSources: [],
  streams: [],
  packages: [],
  models: [],
});

export const useAppStore = create<AppState>((set, _) => ({
  ...initial,

  addStorageBackend: (b) =>
    set((st) => {
      const next = [...st.storageBackends, { ...(b as any), id: nanoid() }];
      saveJson(KEY, { ...st, storageBackends: next });
      return { storageBackends: next };
    }),

  removeStorageBackend: (id) =>
    set((st) => {
      const next = st.storageBackends.filter((x) => x.id !== id);
      saveJson(KEY, { ...st, storageBackends: next });
      return { storageBackends: next };
    }),

  upsertApiSource: (s) =>
    set((st) => {
      const id = s.id ?? nanoid();
      const next = st.apiSources.some((x) => x.id === id)
        ? st.apiSources.map((x) => (x.id === id ? { ...x, ...s, id } : x))
        : [...st.apiSources, { ...(s as any), id }];
      saveJson(KEY, { ...st, apiSources: next });
      return { apiSources: next };
    }),

  removeApiSource: (id) =>
    set((st) => {
      const next = st.apiSources.filter((x) => x.id !== id);
      saveJson(KEY, { ...st, apiSources: next });
      return { apiSources: next };
    }),

  upsertStream: (s) =>
    set((st) => {
      const id = s.id ?? nanoid();
      const next = st.streams.some((x) => x.id === id)
        ? st.streams.map((x) => (x.id === id ? { ...x, ...s, id } : x))
        : [...st.streams, { ...(s as any), id }];
      saveJson(KEY, { ...st, streams: next });
      return { streams: next };
    }),

  removeStream: (id) =>
    set((st) => {
      const next = st.streams.filter((x) => x.id !== id);
      saveJson(KEY, { ...st, streams: next });
      return { streams: next };
    }),

  setStreamPreview: (id, previewJson, inferredSchema) =>
    set((st) => {
      const next = st.streams.map((x) =>
        x.id === id ? { ...x, previewJson, inferredSchema } : x,
      );
      saveJson(KEY, { ...st, streams: next });
      return { streams: next };
    }),

  addPackage: (p) =>
    set((st) => {
      const next = [
        ...st.packages,
        {
          ...p,
          id: nanoid(),
          createdAt: new Date().toISOString(),
          status: "draft" as const,
        },
      ];
      saveJson(KEY, { ...st, packages: next });
      return { packages: next };
    }),

  updatePackage: (id, patch) =>
    set((st) => {
      const next = st.packages.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      );
      saveJson(KEY, { ...st, packages: next });
      return { packages: next };
    }),

  upsertModel: (m) =>
    set((st) => {
      const id = (m as any).id ?? nanoid();
      const next = st.models.some((x: any) => (x as any).id === id)
        ? st.models.map((x: any) =>
            (x as any).id === id ? { ...x, ...m, id } : x,
          )
        : [...st.models, { ...(m as any), id }];
      saveJson(KEY, { ...st, models: next });
      return { models: next };
    }),

  removeModel: (id) =>
    set((st) => {
      const next = st.models.filter((x: any) => (x as any).id !== id);
      saveJson(KEY, { ...st, models: next });
      return { models: next };
    }),

  resetAll: () =>
    set(() => {
      const next = {
        storageBackends: [],
        apiSources: [],
        streams: [],
        packages: [],
        models: [],
      };
      saveJson(KEY, next);
      return next as any;
    }),
}));
