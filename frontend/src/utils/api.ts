const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

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
  },

  // API Sources
  apiSources: {
    list: () => request("/api-sources/"),
    get: (id: string) => request(`/api-sources/${id}/`),
    create: (data: any) =>
      request("/api-sources/", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`/api-sources/${id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`/api-sources/${id}/`, {
        method: "DELETE",
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
  },

  // Data Packages
  packages: {
    list: () => request("/packages/"),
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
};
