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
} from "@mantine/core";
import { useMemo, useState, useEffect } from "react";
import { useAppStore, type DataSource } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { inferSchemaFromJson, schemaToPretty } from "../../utils/schemaInfer";
import { IconPlus, IconTrash, IconWand } from "@tabler/icons-react";
import { JsonPreviewPanel } from "./JsonPreviewPanel";
import { z } from "zod";

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
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { dataSources, topics, upsertStream, setStreamPreview } = useAppStore();

  const apiOptions = dataSources.map((s) => ({ value: String(s.id), label: s.name }));
  const defaultApi = apiOptions[0]?.value ?? "";
  
  const topicOptions = topics.map((t) => ({ value: String(t.id), label: t.name }));
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
    ingestion_strategy: "full_refresh" as "full_refresh" | "incremental" | "snapshot",
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
  >({
    type: "page",
    pageParam: "page",
    sizeParam: "limit",
    pageStart: 1,
    pageSize: 100,
  });

  const [previewText, setPreviewText] = useState<string>(
    JSON.stringify(
      {
        data: [
          {
            id: "a1",
            name: "Widget",
            price: 12.5,
            tags: ["new"],
            created_at: "2025-12-01T12:00:00Z",
          },
          {
            id: "a2",
            name: "Gadget",
            price: 7.0,
            tags: ["sale"],
            created_at: "2025-12-02T12:00:00Z",
          },
        ],
        next_cursor: "abc123",
      },
      null,
      2,
    ),
  );

  // Update selected source when dataSourceId changes
  useEffect(() => {
    const source = dataSources.find(s => s.id === form.dataSourceId);
    setSelectedSource(source || null);
  }, [form.dataSourceId, dataSources]);

  const parsedPreview = useMemo(() => {
    try {
      return { ok: true as const, json: JSON.parse(previewText) as unknown };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Invalid JSON" };
    }
  }, [previewText]);

  const inferred = useMemo(() => {
    if (!parsedPreview.ok) return null;
    return inferSchemaFromJson(parsedPreview.json);
  }, [parsedPreview]);

  const saveStream = () => {
    try {
      z.object({
        dataSourceId: z.string().min(1),
        topicId: z.string().min(1),
        name: z.string().min(2),
      }).parse(form);

      const cleanKV = (rows: KV[]) =>
        rows.filter((r) => r.key.trim().length > 0);

      let stream: any = {
        data_source: form.dataSourceId,
        topic: form.topicId,
        name: form.name,
        schedule_enabled: form.schedule_enabled,
      };

      // Add scheduling config
      if (form.schedule_enabled) {
        if (form.use_cron) {
          stream.schedule_cron = form.schedule_cron;
        } else {
          stream.schedule_interval_minutes = form.schedule_interval_minutes;
        }
      }

      // Add source-specific fields based on data source type
      if (selectedSource?.type === "api") {
        stream = {
          ...stream,
          method: form.method,
          path: form.path,
          query_params: cleanKV(queryParams),
          headers: cleanKV(headers),
          body_template: form.method === "POST" ? bodyTemplate : undefined,
          pagination,
        };
      } else if (selectedSource?.type === "database") {
        stream = {
          ...stream,
          table_name: form.table_name,
          ingestion_strategy: form.ingestion_strategy,
          incremental_key: form.ingestion_strategy === "incremental" ? form.incremental_key : undefined,
        };
      } else if (selectedSource?.type === "s3") {
        stream = {
          ...stream,
          s3_path_pattern: form.s3_path_pattern,
          s3_file_format: form.s3_file_format,
        };
      } else if (selectedSource?.type === "sftp") {
        stream = {
          ...stream,
          sftp_path_pattern: form.sftp_path_pattern,
          sftp_file_format: form.sftp_file_format,
        };
      }

      // save stream first
      upsertStream(stream);

      // then save preview + inferred schema (if valid) for API sources
      if (selectedSource?.type === "api" && parsedPreview.ok && inferred) {
        const created = useAppStore
          .getState()
          .streams.slice()
          .reverse()
          .find(
            (s) =>
              s.name === stream.name &&
              s.path === stream.path &&
              s.data_source === stream.data_source,
          );

        if (created) setStreamPreview(created.id, parsedPreview.json, inferred);
      }

      notifications.show({ message: "Stream saved", color: "teal" });
      onClose();
    } catch (e: any) {
      notifications.show({
        message: e?.message ?? "Validation error",
        color: "red",
      });
    }
  };

  const mockRegenerate = () => {
    setPreviewText(
      JSON.stringify(
        {
          items: [
            {
              id: 1,
              email: "a@example.com",
              active: true,
              meta: { plan: "pro", seats: 3 },
            },
            {
              id: 2,
              email: "b@example.com",
              active: false,
              meta: { plan: "free", seats: 1 },
            },
          ],
          pagination: { next: "cursor_002" },
        },
        null,
        2,
      ),
    );
    notifications.show({
      message: "Mock preview JSON generated",
      color: "blue",
    });
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Add stream"
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
                        onChange={(e) => setForm({ ...form, path: e.target.value })}
                        description="Relative to the API Source base URL"
                      />
                    </SimpleGrid>

                    <Divider label="Parameters" />
                    {kvRowEditor(queryParams, setQueryParams, "Query parameters")}
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
                      }}
                      data={[
                        { value: "none", label: "None" },
                        { value: "page", label: "Page/Size params" },
                        { value: "cursor", label: "Cursor-based" },
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
                  </>
                )}

                {selectedSource?.type === "database" && (
                  <>
                    <TextInput
                      label="Table Name"
                      value={form.table_name}
                      onChange={(e) => setForm({ ...form, table_name: e.target.value })}
                      required
                      description="Name of the table or view to extract from"
                    />
                    <Select
                      label="Ingestion Strategy"
                      value={form.ingestion_strategy}
                      onChange={(v) =>
                        setForm({ ...form, ingestion_strategy: (v as any) ?? "full_refresh" })
                      }
                      data={[
                        { value: "full_refresh", label: "Full Refresh (replace all data)" },
                        { value: "incremental", label: "Incremental Load (append new/changed)" },
                        { value: "snapshot", label: "Snapshot (point-in-time copy)" },
                      ]}
                    />
                    {form.ingestion_strategy === "incremental" && (
                      <TextInput
                        label="Incremental Key Column"
                        value={form.incremental_key}
                        onChange={(e) => setForm({ ...form, incremental_key: e.target.value })}
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
                      onChange={(e) => setForm({ ...form, s3_path_pattern: e.target.value })}
                      description="Path pattern for S3 objects (e.g., data/*.parquet or data/year={year}/*.csv)"
                      required
                    />
                    <Select
                      label="File Format"
                      value={form.s3_file_format}
                      onChange={(v) =>
                        setForm({ ...form, s3_file_format: (v as any) ?? "parquet" })
                      }
                      data={[
                        { value: "parquet", label: "Parquet" },
                        { value: "csv", label: "CSV" },
                        { value: "json", label: "JSON" },
                        { value: "avro", label: "Avro" },
                      ]}
                    />
                    <Text size="sm" c="dimmed">
                      For S3 sources, data packages will point to the external S3 location without copying data.
                    </Text>
                  </>
                )}

                {selectedSource?.type === "sftp" && (
                  <>
                    <TextInput
                      label="SFTP Path Pattern"
                      value={form.sftp_path_pattern}
                      onChange={(e) => setForm({ ...form, sftp_path_pattern: e.target.value })}
                      description="Path pattern for SFTP files (e.g., /data/*.csv or /exports/daily_*.json)"
                      required
                    />
                    <Select
                      label="File Format"
                      value={form.sftp_file_format}
                      onChange={(v) =>
                        setForm({ ...form, sftp_file_format: (v as any) ?? "csv" })
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

                <Divider label="Scheduling" />
                
                <Switch
                  label="Enable Scheduled Extraction"
                  description="Automatically extract data on a schedule"
                  checked={form.schedule_enabled}
                  onChange={(e) =>
                    setForm({ ...form, schedule_enabled: e.currentTarget.checked })
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
                          setForm({ ...form, schedule_interval_minutes: Number(v) || 60 })
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
                    Paste or generate a sample response JSON
                  </Badge>
                  <Button
                    leftSection={<IconWand size={16} />}
                    variant="light"
                    onClick={mockRegenerate}
                  >
                    Generate mock
                  </Button>
                </Group>

                <JsonPreviewPanel
                  value={previewText}
                  onChange={setPreviewText}
                  parseError={parsedPreview.ok ? undefined : parsedPreview.error}
                  inferredSchemaText={
                    inferred ? schemaToPretty(inferred) : undefined
                  }
                />
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
    </Drawer>
  );
}
