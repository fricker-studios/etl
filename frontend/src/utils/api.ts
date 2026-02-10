const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { requiresAuth = true, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (requiresAuth) {
    const token = localStorage.getItem("accessToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || "Request failed");
  }

  // Handle 204 No Content responses (e.g., DELETE)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  baseUrl: API_BASE_URL,

  // Storage Backends
  storageBackends: {
    list: () => request("/storage-backends/"),
    get: (id: string) => request(`/storage-backends/${id}/`),
    create: (data: any) =>
      request("/storage-backends/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/storage-backends/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/storage-backends/${id}/`, {
        method: "DELETE",
      }),
    browseS3: (id: string, prefix: string = "") =>
      request(`/storage-backends/${id}/browse_s3/?prefix=${encodeURIComponent(prefix)}`),
  },

  // Data Sources (renamed from apiSources)
  dataSources: {
    list: () => request("/data-sources/"),
    get: (id: string) => request(`/data-sources/${id}/`),
    create: (data: any) =>
      request("/data-sources/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/data-sources/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/data-sources/${id}/`, {
        method: "DELETE",
      }),
    decrypt: (id: string) =>
      request(`/data-sources/${id}/decrypt/`, {
        method: "GET",
      }),
  },

  // Streams
  streams: {
    list: () => request("/streams/"),
    get: (id: string) => request(`/streams/${id}/`),
    create: (data: any) =>
      request("/streams/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/streams/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/streams/${id}/`, {
        method: "DELETE",
      }),
    execute: (id: string) =>
      request(`/streams/${id}/execute/`, {
        method: "POST",
      }),
    previewS3Files: (data: { data_source_id: string; path_pattern: string }) =>
      request("/streams/preview_s3_files/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // Data Packages
  packages: {
    list: (params?: { topic_revision?: string }) => {
      const queryString = params?.topic_revision
        ? `?topic_revision=${params.topic_revision}`
        : "";
      return request(`/packages/${queryString}`);
    },
    get: (id: string) => request(`/packages/${id}/`),
    create: (data: any) =>
      request("/packages/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/packages/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/packages/${id}/`, {
        method: "DELETE",
      }),
    download: (id: string) => request(`/packages/${id}/download/`),
  },

  // Models
  models: {
    list: () => request("/models/"),
    get: (id: string) => request(`/models/${id}/`),
    create: (data: any) =>
      request("/models/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/models/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/models/${id}/`, {
        method: "DELETE",
      }),
  },

  // Topics
  topics: {
    list: () => request("/topics/"),
    get: (id: string) => request(`/topics/${id}/`),
    create: (data: any) =>
      request("/topics/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/topics/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/topics/${id}/`, {
        method: "DELETE",
      }),
  },

  // Topic Revisions
  topicRevisions: {
    list: () => request("/topic-revisions/"),
    get: (id: string) => request(`/topic-revisions/${id}/`),
    create: (data: any) =>
      request("/topic-revisions/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/topic-revisions/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/topic-revisions/${id}/`, {
        method: "DELETE",
      }),
  },

  // Runs
  runs: {
    list: () => request("/runs/"),
    get: (id: string) => request(`/runs/${id}/`),
    create: (data: any) =>
      request("/runs/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/runs/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/runs/${id}/`, {
        method: "DELETE",
      }),
  },
};
