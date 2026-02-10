import {
  Drawer,
  Stack,
  TextInput,
  Select,
  SimpleGrid,
  Button,
  Group,
  Tabs,
  Textarea,
  Divider,
  ActionIcon,
  Table,
  Badge,
  Switch,
  NumberInput,
  Text,
  Card,
} from "@mantine/core";
import { useMemo, useState, useEffect } from "react";
import { useDisclosure } from "@mantine/hooks";
import { type DataSource } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { inferSchemaFromJson, schemaToPretty } from "../../utils/schemaInfer";
import { IconPlus, IconTrash, IconWand } from "@tabler/icons-react";
import { JsonPreviewPanel } from "./JsonPreviewPanel";
import { TopicDrawer } from "./TopicDrawer";
import { api } from "../../utils/api";
import { z } from "zod";
import { useDataSources } from "../../hooks/useDataSources";
import { useTopics } from "../../hooks/useTopics";
import { useCreateStream, useUpdateStream } from "../../hooks/useStreams";
import type { Stream } from "../../store/useAppStore";

type KV = { key: string; value: string };

function kvRowEditor(rows: KV[], setRows: (rows: KV[]) => void, label: string) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Badge variant="light">{label}</Badge>
        <ActionIcon
          variant="light"
          onClick={() => setRows([...rows, { key: "", value: "" }])}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: "45%" }}>Key</Table.Th>
            <Table.Th style={{ width: "45%" }}>Value</Table.Th>
            <Table.Th style={{ width: "10%" }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, idx) => (
            <Table.Tr key={idx}>
              <Table.Td>
                <TextInput
                  placeholder="key"
                  value={r.key}
                  onChange={(e) => {
                    const next = rows.slice();
                    next[idx] = { ...r, key: e.target.value };
                    setRows(next);
                  }}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  placeholder="value"
                  value={r.value}
                  onChange={(e) => {
                    const next = rows.slice();
                    next[idx] = { ...r, value: e.target.value };
                    setRows(next);
                  }}
                />
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
          {rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Badge variant="light">None</Badge>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export function StreamDrawer({
  opened,
  onClose,
  stream,
}: {
  opened: boolean;
  onClose: () => void;
  stream?: Stream | null;
}) {
  const { data: dataSources = [] } = useDataSources();
  const { data: topics = [] } = useTopics();
  const createStream = useCreateStream();
  const updateStream = useUpdateStream();

  const [topicDrawerOpen, { open: openTopicDrawer, close: closeTopicDrawer }] =
    useDisclosure(false);

  const apiOptions = dataSources.map((s) => ({
    value: String(s.id),
    label: `${s.name} (${s.type.toUpperCase()})`,
  }));
  const defaultApi = apiOptions[0]?.value ?? "";

  const topicOptions = topics.map((t) => ({
    value: String(t.id),
    label: t.name,
  }));
  const defaultTopic = topicOptions[0]?.value ?? "";

  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [form, setForm] = useState({
    dataSourceId: defaultApi,
    topicId: defaultTopic,
    name: "My Stream",
    method: "GET" as "GET" | "POST",
    path: "/v1/items",

    // Database fields
    table_name: "",
    ingestion_strategy: "full_refresh" as
      | "full_refresh"
      | "incremental"
      | "snapshot",
    incremental_key: "",

    // S3 fields
    s3_path_pattern: "data/*.parquet",
    s3_file_format: "parquet",

    // SFTP fields
    sftp_path_pattern: "/data/*.csv",
    sftp_file_format: "csv",

    // Scheduling
    schedule_enabled: false,
    schedule_cron: "0 0 * * *",
    schedule_interval_minutes: 60,
    use_cron: true,
  });

  const [queryParams, setQueryParams] = useState<KV[]>([
    { key: "limit", value: "100" },
  ]);
  const [headers, setHeaders] = useState<KV[]>([]);
  const [bodyTemplate, setBodyTemplate] = useState<string>(
    '{\n  "since": "{{cursor}}"\n}',
  );
  const [pagination, setPagination] = useState<
    | { type: "none" }
    | {
        type: "page";
        pageParam: string;
        sizeParam?: string;
        pageStart: number;
        pageSize?: number;
      }
    | { type: "cursor"; cursorParam: string; cursorPathInResponse: string }
    | {
        type: "cursor_url";
        cursorParam: string;
        cursorUrlPathInResponse: string;
        useFullUrl?: boolean;
      }
  >({
    type: "page",
    pageParam: "page",
    sizeParam: "limit",
    pageStart: 1,
    pageSize: 100,
  });

  const [recordsSelector, setRecordsSelector] = useState<string>("data");

  const [previewText, setPreviewText] = useState<string>("");

  // S3 file preview state
  const [s3Files, setS3Files] = useState<any[]>([]);
  const [s3PreviewLoading, setS3PreviewLoading] = useState(false);
  const [testApiLoading, setTestApiLoading] = useState(false);
  const [topicSchemaForCreation, setTopicSchemaForCreation] = useState<
    any[] | null
  >(null);
  const [topicNameForCreation, setTopicNameForCreation] = useState<string>("");

  const s3FilesTotalSize = useMemo(() => {
    return s3Files.reduce((sum, file) => sum + (file.size || 0), 0);
  }, [s3Files]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Update selected source when dataSourceId changes
  useEffect(() => {
    const source = dataSources.find((s) => String(s.id) === form.dataSourceId);
    setSelectedSource(source || null);
  }, [form.dataSourceId, dataSources]);

  // Initialize form when editing a stream
  useEffect(() => {
    if (stream && opened) {
      setForm({
        dataSourceId: String(stream.data_source),
        topicId: String(stream.topic || defaultTopic),
        name: stream.name,
        method: (stream.method || "GET") as "GET" | "POST",
        path: stream.path || "/v1/items",
        table_name: stream.table_name || "",
        ingestion_strategy: stream.ingestion_strategy || "full_refresh",
        incremental_key: stream.incremental_key || "",
        s3_path_pattern: stream.s3_path_pattern || "data/*.parquet",
        s3_file_format: stream.s3_file_format || "parquet",
        sftp_path_pattern: stream.sftp_path_pattern || "",
        sftp_file_format: stream.sftp_file_format || "csv",
        schedule_enabled: stream.schedule_enabled || false,
        use_cron: !!stream.schedule_cron,
        schedule_cron: stream.schedule_cron || "0 0 * * *",
        schedule_interval_minutes: stream.schedule_interval_minutes || 60,
      });

      if (stream.query_params) {
        setQueryParams(stream.query_params);
      }
      if (stream.headers) {
        setHeaders(stream.headers);
      }
      if (stream.body_template) {
        setBodyTemplate(stream.body_template);
      }
      if (stream.pagination) {
        setPagination(stream.pagination as any);
      }
      if (stream.records_selector) {
        setRecordsSelector(stream.records_selector);
      }
    }
  }, [stream, opened, dataSources, defaultTopic]);

  const handleTopicCreated = (topicId: string) => {
    // Update form with newly created topic
    setForm({ ...form, topicId });
    // Clear the schema for creation
    setTopicSchemaForCreation(null);
    setTopicNameForCreation("");
  };

  const createTopicFromStream = () => {
    if (!inferred || inferred.kind !== "object") {
      notifications.show({
        message:
          "Please test the API or provide valid preview JSON with object data",
        color: "orange",
      });
      return;
    }

    // Convert inferred schema to SchemaColumn format
    const schemaColumns = Object.entries(inferred.fields).map(
      ([name, type], idx) => {
        let dataType = "string";
        if (type.kind === "number") dataType = "float";
        else if (type.kind === "boolean") dataType = "boolean";
        else if (type.kind === "array") dataType = "array";
        else if (type.kind === "object") dataType = "json";

        return {
          name,
          position: idx,
          data_type: dataType,
          nullable: true,
        };
      },
    );

    setTopicSchemaForCreation(schemaColumns);
    setTopicNameForCreation(form.name ? `${form.name} Topic` : "");
    openTopicDrawer();
  };

  const parsedPreview = useMemo(() => {
    try {
      return { ok: true as const, json: JSON.parse(previewText) as unknown };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Invalid JSON" };
    }
  }, [previewText]);

  const inferred = useMemo(() => {
    if (!parsedPreview.ok) return null;

    // If preview data has our special structure, use the records for schema inference
    const jsonData = parsedPreview.json as any;
    if (
      jsonData &&
      typeof jsonData === "object" &&
      "records" in jsonData &&
      "_preview_info" in jsonData
    ) {
      // Use the extracted records for schema inference
      return inferSchemaFromJson(jsonData.records);
    }

    // Otherwise infer from the full JSON
    return inferSchemaFromJson(parsedPreview.json);
  }, [parsedPreview]);

  const previewS3Files = async () => {
    if (!form.dataSourceId || !form.s3_path_pattern) {
      notifications.show({
        message: "Please select a data source and enter a path pattern",
        color: "orange",
      });
      return;
    }

    setS3PreviewLoading(true);
    setS3Files([]);

    try {
      const response: any = await api.streams.previewS3Files({
        data_source_id: form.dataSourceId,
        path_pattern: form.s3_path_pattern,
      });

      setS3Files(response.files || []);

      if (response.files && response.files.length > 0) {
        notifications.show({
          message: `Found ${response.count} file(s) matching pattern`,
          color: "teal",
        });
      } else {
        notifications.show({
          message: "No files found matching the pattern",
          color: "orange",
        });
      }
    } catch (error: any) {
      notifications.show({
        message: error.message || "Failed to preview S3 files",
        color: "red",
      });
    } finally {
      setS3PreviewLoading(false);
    }
  };

  const testApiCall = async () => {
    if (!selectedSource || selectedSource.type !== "api") {
      notifications.show({
        message: "Please select an API data source",
        color: "orange",
      });
      return;
    }

    if (!form.path) {
      notifications.show({
        message: "Please enter an API path",
        color: "orange",
      });
      return;
    }

    setTestApiLoading(true);

    try {
      // First, get decrypted credentials from backend
      const decryptedSource: any = await api.dataSources.decrypt(
        form.dataSourceId,
      );

      // Helper function to extract value from nested path
      const extractByPath = (obj: any, path: string): any => {
        if (!path || !obj) return obj;
        const keys = path.split(".");
        let result = obj;
        for (const key of keys) {
          if (result && typeof result === "object" && key in result) {
            result = result[key];
          } else {
            return undefined;
          }
        }
        return result;
      };

      // Helper function to make API call
      const makeApiCall = async (pageParam?: any): Promise<any> => {
        const baseUrl =
          decryptedSource.base_url || selectedSource.base_url || "";
        const path = form.path.startsWith("/") ? form.path : `/${form.path}`;
        let url = `${baseUrl}${path}`;

        // Add query params
        const params = new URLSearchParams();
        queryParams.forEach((p) => {
          if (p.key && p.value) {
            params.append(p.key, p.value);
          }
        });

        // Add pagination params
        if (pageParam !== undefined) {
          if (pagination.type === "page" && pagination.pageParam) {
            params.set(pagination.pageParam, String(pageParam));
          } else if (pagination.type === "cursor" && pagination.cursorParam) {
            params.set(pagination.cursorParam, String(pageParam));
          } else if (
            pagination.type === "cursor_url" &&
            pagination.cursorParam
          ) {
            // For cursor_url, pageParam IS the full URL
            if (typeof pageParam === "string" && pageParam.startsWith("http")) {
              url = pageParam;
            } else {
              params.set(pagination.cursorParam, String(pageParam));
            }
          }
        }

        if (params.toString() && !url.includes("?")) {
          url += `?${params.toString()}`;
        }

        // Build headers
        const requestHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Add auth headers using DECRYPTED values
        if (
          decryptedSource.auth_type === "bearer" &&
          decryptedSource.bearer_token
        ) {
          requestHeaders["Authorization"] =
            `Bearer ${decryptedSource.bearer_token}`;
        } else if (
          decryptedSource.auth_type === "basic" &&
          decryptedSource.basic_user &&
          decryptedSource.basic_pass
        ) {
          const credentials = btoa(
            `${decryptedSource.basic_user}:${decryptedSource.basic_pass}`,
          );
          requestHeaders["Authorization"] = `Basic ${credentials}`;
        } else if (
          decryptedSource.auth_type === "header" &&
          decryptedSource.header_name &&
          decryptedSource.header_value
        ) {
          requestHeaders[decryptedSource.header_name] =
            decryptedSource.header_value;
        }

        // Add custom headers
        headers.forEach((h) => {
          if (h.key && h.value) {
            requestHeaders[h.key] = h.value;
          }
        });

        // Make the request
        const options: RequestInit = {
          method: form.method,
          headers: requestHeaders,
        };

        if (form.method === "POST" && bodyTemplate) {
          options.body = bodyTemplate;
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      };

      // Make initial API call
      let currentPage =
        pagination.type === "page" ? pagination.pageStart : undefined;
      const firstPageData = await makeApiCall(currentPage);

      // Extract records using records selector
      const records = recordsSelector
        ? extractByPath(firstPageData, recordsSelector)
        : firstPageData;

      // Extract pagination info
      let paginationInfo: any = {
        currentPage: currentPage || 1,
        hasMore: false,
        nextCursor: undefined,
        nextUrl: undefined,
      };

      if (pagination.type === "page") {
        // For page-based pagination, assume there's more if we got a full page
        if (Array.isArray(records) && pagination.pageSize) {
          paginationInfo.hasMore = records.length >= pagination.pageSize;
          paginationInfo.nextPage = (currentPage || pagination.pageStart) + 1;
        }
      } else if (
        pagination.type === "cursor" &&
        pagination.cursorPathInResponse
      ) {
        const nextCursor = extractByPath(
          firstPageData,
          pagination.cursorPathInResponse,
        );
        if (nextCursor) {
          paginationInfo.hasMore = true;
          paginationInfo.nextCursor = nextCursor;
        }
      } else if (
        pagination.type === "cursor_url" &&
        pagination.cursorUrlPathInResponse
      ) {
        const nextUrl = extractByPath(
          firstPageData,
          pagination.cursorUrlPathInResponse,
        );
        if (nextUrl) {
          paginationInfo.hasMore = true;
          paginationInfo.nextUrl = nextUrl;
        }
      }

      // Build preview data with pagination info
      const previewData = {
        _preview_info: {
          records_selector: recordsSelector || "(none - using full response)",
          pagination_type: pagination.type,
          pagination_info: paginationInfo,
          total_records_shown: Array.isArray(records) ? records.length : 1,
        },
        records: records,
        raw_response: firstPageData,
      };

      setPreviewText(JSON.stringify(previewData, null, 2));

      notifications.show({
        message: `API call successful! ${Array.isArray(records) ? records.length : 1} record(s) loaded${paginationInfo.hasMore ? " (more pages available)" : ""}.`,
        color: "teal",
      });
    } catch (error: any) {
      notifications.show({
        message: error.message || "Failed to call API",
        color: "red",
      });
    } finally {
      setTestApiLoading(false);
    }
  };

  const saveStream = () => {
    try {
      z.object({
        dataSourceId: z.string().min(1),
        topicId: z.string().min(1),
        name: z.string().min(2),
      }).parse(form);

      const cleanKV = (rows: KV[]) =>
        rows.filter((r) => r.key.trim().length > 0);

      let streamData: any = {
        data_source: form.dataSourceId,
        topic: form.topicId,
        name: form.name,
        schedule_enabled: form.schedule_enabled,
      };

      // Add scheduling config
      if (form.schedule_enabled) {
        if (form.use_cron) {
          streamData.schedule_cron = form.schedule_cron;
        } else {
          streamData.schedule_interval_minutes = form.schedule_interval_minutes;
        }
      }

      // Add source-specific fields based on data source type
      if (selectedSource?.type === "api") {
        streamData = {
          ...streamData,
          method: form.method,
          path: form.path,
          query_params: cleanKV(queryParams),
          headers: cleanKV(headers),
          body_template: form.method === "POST" ? bodyTemplate : undefined,
          pagination,
          records_selector: recordsSelector || undefined,
        };
      } else if (selectedSource?.type === "database") {
        streamData = {
          ...streamData,
          table_name: form.table_name,
          ingestion_strategy: form.ingestion_strategy,
          incremental_key:
            form.ingestion_strategy === "incremental"
              ? form.incremental_key
              : undefined,
        };
      } else if (selectedSource?.type === "s3") {
        streamData = {
          ...streamData,
          s3_path_pattern: form.s3_path_pattern,
          s3_file_format: form.s3_file_format,
        };
      } else if (selectedSource?.type === "sftp") {
        streamData = {
          ...streamData,
          sftp_path_pattern: form.sftp_path_pattern,
          sftp_file_format: form.sftp_file_format,
        };
      }

      // Use create or update based on whether stream exists
      if (stream?.id) {
        updateStream.mutate(
          { id: stream.id, data: streamData },
          {
            onSuccess: () => {
              onClose();
            },
          },
        );
      } else {
        createStream.mutate(streamData, {
          onSuccess: () => {
            onClose();
          },
        });
      }
    } catch (e: any) {
      notifications.show({
        message: e?.message ?? "Validation error",
        color: "red",
      });
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={stream ? "Edit stream" : "Add stream"}
      position="right"
      size="xl"
    >
      <Stack>
        {dataSources.length === 0 ? (
          <Badge color="yellow" variant="light">
            Create a Data Source first.
          </Badge>
        ) : (
          <Tabs defaultValue="config">
            <Tabs.List>
              <Tabs.Tab value="config">Configuration</Tabs.Tab>
              <Tabs.Tab value="schedule">Destination & Schedule</Tabs.Tab>
              {selectedSource?.type === "api" && (
                <Tabs.Tab value="preview">Preview & Schema</Tabs.Tab>
              )}
            </Tabs.List>

            <Tabs.Panel value="config" pt="md">
              <Stack>
                <Select
                  label="Data Source"
                  data={apiOptions}
                  value={form.dataSourceId}
                  onChange={(v) =>
                    setForm({ ...form, dataSourceId: (v as any) ?? "" })
                  }
                />

                <TextInput
                  label="Stream Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />

                {selectedSource?.type === "api" && (
                  <>
                    <SimpleGrid cols={2}>
                      <Select
                        label="Method"
                        data={[
                          { value: "GET", label: "GET" },
                          { value: "POST", label: "POST" },
                        ]}
                        value={form.method}
                        onChange={(v) =>
                          setForm({ ...form, method: (v as any) ?? "GET" })
                        }
                      />
                      <TextInput
                        label="Path"
                        value={form.path}
                        onChange={(e) =>
                          setForm({ ...form, path: e.target.value })
                        }
                        description="Relative to the API Source base URL"
                      />
                    </SimpleGrid>

                    <Divider label="Parameters" />
                    {kvRowEditor(
                      queryParams,
                      setQueryParams,
                      "Query parameters",
                    )}
                    {kvRowEditor(headers, setHeaders, "Request headers")}

                    {form.method === "POST" && (
                      <>
                        <Divider label="Body" />
                        <Textarea
                          label="Body template (optional)"
                          value={bodyTemplate}
                          onChange={(e) => setBodyTemplate(e.target.value)}
                          autosize
                          minRows={6}
                          description='Use placeholders like "{{cursor}}" (frontend-only).'
                        />
                      </>
                    )}

                    <Divider label="Pagination" />
                    <Select
                      label="Pagination type"
                      value={pagination.type}
                      onChange={(v) => {
                        const type = (v as any) ?? "none";
                        if (type === "none") setPagination({ type: "none" });
                        if (type === "page")
                          setPagination({
                            type: "page",
                            pageParam: "page",
                            sizeParam: "limit",
                            pageStart: 1,
                            pageSize: 100,
                          });
                        if (type === "cursor")
                          setPagination({
                            type: "cursor",
                            cursorParam: "cursor",
                            cursorPathInResponse: "next_cursor",
                          });
                        if (type === "cursor_url")
                          setPagination({
                            type: "cursor_url",
                            cursorParam: "cursor",
                            cursorUrlPathInResponse: "next_url",
                          });
                      }}
                      data={[
                        { value: "none", label: "None" },
                        { value: "page", label: "Page/Size params" },
                        { value: "cursor", label: "Cursor-based (value)" },
                        { value: "cursor_url", label: "Cursor-based (URL)" },
                      ]}
                    />

                    {pagination.type === "page" && (
                      <SimpleGrid cols={2}>
                        <TextInput
                          label="Page param"
                          value={pagination.pageParam}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              pageParam: e.target.value,
                            })
                          }
                        />
                        <TextInput
                          label="Size param"
                          value={pagination.sizeParam ?? ""}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              sizeParam: e.target.value,
                            })
                          }
                        />
                        <TextInput
                          label="Start page"
                          value={String(pagination.pageStart)}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              pageStart: Number(e.target.value || 1),
                            })
                          }
                        />
                        <TextInput
                          label="Page size"
                          value={String(pagination.pageSize ?? "")}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              pageSize: Number(e.target.value || 100),
                            })
                          }
                        />
                      </SimpleGrid>
                    )}

                    {pagination.type === "cursor" && (
                      <SimpleGrid cols={2}>
                        <TextInput
                          label="Cursor param"
                          value={pagination.cursorParam}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              cursorParam: e.target.value,
                            })
                          }
                        />
                        <TextInput
                          label="Cursor path in response"
                          value={pagination.cursorPathInResponse}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              cursorPathInResponse: e.target.value,
                            })
                          }
                          description='Example: "next_cursor" or "pagination.next"'
                        />
                      </SimpleGrid>
                    )}

                    {pagination.type === "cursor_url" && (
                      <>
                        <SimpleGrid cols={2}>
                          <TextInput
                            label="Cursor param"
                            value={pagination.cursorParam}
                            onChange={(e) =>
                              setPagination({
                                ...pagination,
                                cursorParam: e.target.value,
                              })
                            }
                            description="Query param name (e.g., 'cursor' or 'page_token')"
                          />
                          <TextInput
                            label="Next URL path in response"
                            value={pagination.cursorUrlPathInResponse}
                            onChange={(e) =>
                              setPagination({
                                ...pagination,
                                cursorUrlPathInResponse: e.target.value,
                              })
                            }
                            description='JSON path to next URL (e.g., "next_url" or "links.next")'
                          />
                        </SimpleGrid>
                        <Switch
                          label="Use full URL from response"
                          description="Use the complete URL instead of extracting cursor as parameter"
                          checked={pagination.useFullUrl ?? false}
                          onChange={(e) =>
                            setPagination({
                              ...pagination,
                              useFullUrl: e.currentTarget.checked,
                            })
                          }
                        />
                      </>
                    )}

                    <Divider label="Response Data" />
                    <TextInput
                      label="Records Selector"
                      value={recordsSelector}
                      onChange={(e) => setRecordsSelector(e.target.value)}
                      description='JSON path to extract records array (e.g., "data", "results", "items")'
                      placeholder="data"
                    />
                  </>
                )}

                {selectedSource?.type === "database" && (
                  <>
                    <TextInput
                      label="Table Name"
                      value={form.table_name}
                      onChange={(e) =>
                        setForm({ ...form, table_name: e.target.value })
                      }
                      required
                      description="Name of the table or view to extract from"
                    />
                    <Select
                      label="Ingestion Strategy"
                      value={form.ingestion_strategy}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          ingestion_strategy: (v as any) ?? "full_refresh",
                        })
                      }
                      data={[
                        {
                          value: "full_refresh",
                          label: "Full Refresh (replace all data)",
                        },
                        {
                          value: "incremental",
                          label: "Incremental Load (append new/changed)",
                        },
                        {
                          value: "snapshot",
                          label: "Snapshot (point-in-time copy)",
                        },
                      ]}
                    />
                    {form.ingestion_strategy === "incremental" && (
                      <TextInput
                        label="Incremental Key Column"
                        value={form.incremental_key}
                        onChange={(e) =>
                          setForm({ ...form, incremental_key: e.target.value })
                        }
                        description="Column name for tracking incremental loads (e.g., updated_at, id)"
                        required
                      />
                    )}
                  </>
                )}

                {selectedSource?.type === "s3" && (
                  <>
                    <TextInput
                      label="S3 Path Pattern"
                      value={form.s3_path_pattern}
                      onChange={(e) =>
                        setForm({ ...form, s3_path_pattern: e.target.value })
                      }
                      description="Path pattern for S3 objects (e.g., data/*.parquet or data/year={year}/*.csv)"
                      required
                    />
                    <Select
                      label="File Format"
                      value={form.s3_file_format}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          s3_file_format: (v as any) ?? "parquet",
                        })
                      }
                      data={[
                        { value: "parquet", label: "Parquet" },
                        { value: "csv", label: "CSV" },
                        { value: "json", label: "JSON" },
                        { value: "avro", label: "Avro" },
                      ]}
                    />
                    <Button
                      variant="light"
                      onClick={previewS3Files}
                      loading={s3PreviewLoading}
                      disabled={!form.s3_path_pattern || !form.dataSourceId}
                    >
                      Preview Files
                    </Button>

                    {s3Files.length > 0 && (
                      <Card withBorder>
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Text fw={500}>
                              Matching Files ({s3Files.length})
                            </Text>
                            <Badge variant="light">
                              {formatBytes(s3FilesTotalSize)}
                            </Badge>
                          </Group>
                          <Table>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>File</Table.Th>
                                <Table.Th>Size</Table.Th>
                                <Table.Th>Last Modified</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {s3Files
                                .slice(0, 10)
                                .map((file: any, idx: number) => (
                                  <Table.Tr key={idx}>
                                    <Table.Td>
                                      <Text
                                        size="sm"
                                        style={{ fontFamily: "monospace" }}
                                      >
                                        {file.key}
                                      </Text>
                                    </Table.Td>
                                    <Table.Td>
                                      <Text size="sm">
                                        {formatBytes(file.size)}
                                      </Text>
                                    </Table.Td>
                                    <Table.Td>
                                      <Text size="sm">
                                        {new Date(
                                          file.last_modified,
                                        ).toLocaleString()}
                                      </Text>
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                            </Table.Tbody>
                          </Table>
                          {s3Files.length > 10 && (
                            <Text size="xs" c="dimmed">
                              Showing 10 of {s3Files.length} files
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    )}

                    <Text size="sm" c="dimmed">
                      For S3 sources, data packages will point to the external
                      S3 location without copying data.
                    </Text>
                  </>
                )}

                {selectedSource?.type === "sftp" && (
                  <>
                    <TextInput
                      label="SFTP Path Pattern"
                      value={form.sftp_path_pattern}
                      onChange={(e) =>
                        setForm({ ...form, sftp_path_pattern: e.target.value })
                      }
                      description="Path pattern for SFTP files (e.g., /data/*.csv or /exports/daily_*.json)"
                      required
                    />
                    <Select
                      label="File Format"
                      value={form.sftp_file_format}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          sftp_file_format: (v as any) ?? "csv",
                        })
                      }
                      data={[
                        { value: "csv", label: "CSV" },
                        { value: "json", label: "JSON" },
                        { value: "xml", label: "XML" },
                        { value: "txt", label: "Text" },
                      ]}
                    />
                  </>
                )}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="schedule" pt="md">
              <Stack>
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-end">
                    <div style={{ flex: 1 }}>
                      <Select
                        label="Topic (Destination)"
                        description="Topic defines the schema and holds data packages from this stream"
                        data={topicOptions}
                        value={form.topicId}
                        onChange={(v) =>
                          setForm({ ...form, topicId: (v as any) ?? "" })
                        }
                        required
                      />
                    </div>
                  </Group>
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={openTopicDrawer}
                    fullWidth
                  >
                    Create New Topic
                  </Button>
                </Stack>

                <Divider label="Scheduling" />

                <Switch
                  label="Enable Scheduled Extraction"
                  description="Automatically extract data on a schedule"
                  checked={form.schedule_enabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule_enabled: e.currentTarget.checked,
                    })
                  }
                />

                {form.schedule_enabled && (
                  <>
                    <Select
                      label="Schedule Type"
                      value={form.use_cron ? "cron" : "interval"}
                      onChange={(v) =>
                        setForm({ ...form, use_cron: v === "cron" })
                      }
                      data={[
                        { value: "cron", label: "Cron Expression" },
                        { value: "interval", label: "Interval (minutes)" },
                      ]}
                    />

                    {form.use_cron ? (
                      <TextInput
                        label="Cron Expression"
                        value={form.schedule_cron}
                        onChange={(e) =>
                          setForm({ ...form, schedule_cron: e.target.value })
                        }
                        description="Unix cron format (e.g., '0 0 * * *' for daily at midnight)"
                      />
                    ) : (
                      <NumberInput
                        label="Interval (minutes)"
                        value={form.schedule_interval_minutes}
                        onChange={(v) =>
                          setForm({
                            ...form,
                            schedule_interval_minutes: Number(v) || 60,
                          })
                        }
                        min={1}
                        description="How often to run the extraction"
                      />
                    )}
                  </>
                )}
              </Stack>
            </Tabs.Panel>

            {selectedSource?.type === "api" && (
              <Tabs.Panel value="preview" pt="md">
                <Group justify="space-between" mb="sm">
                  <Badge variant="light">
                    Test your API or paste sample JSON
                  </Badge>
                  <Button
                    leftSection={<IconWand size={16} />}
                    variant="light"
                    color="blue"
                    onClick={testApiCall}
                    loading={testApiLoading}
                  >
                    Test API
                  </Button>
                </Group>

                <JsonPreviewPanel
                  value={previewText}
                  onChange={setPreviewText}
                  parseError={
                    parsedPreview.ok ? undefined : parsedPreview.error
                  }
                  inferredSchemaText={
                    inferred ? schemaToPretty(inferred) : undefined
                  }
                />

                {inferred &&
                  inferred.kind === "object" &&
                  Object.keys(inferred.fields).length > 0 && (
                    <Card withBorder mt="md" p="sm">
                      <Group justify="space-between">
                        <Text size="sm" fw={500}>
                          Schema inferred from preview data (
                          {Object.keys(inferred.fields).length} fields)
                        </Text>
                        <Button
                          size="sm"
                          variant="light"
                          color="green"
                          onClick={createTopicFromStream}
                        >
                          Create Topic from Schema
                        </Button>
                      </Group>
                    </Card>
                  )}
              </Tabs.Panel>
            )}

            <Divider mt="md" />
            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={saveStream}>Save stream</Button>
            </Group>
          </Tabs>
        )}
      </Stack>

      <TopicDrawer
        opened={topicDrawerOpen}
        onClose={closeTopicDrawer}
        onTopicCreated={handleTopicCreated}
        initialSchema={topicSchemaForCreation || undefined}
        initialName={topicNameForCreation || undefined}
      />
    </Drawer>
  );
}
