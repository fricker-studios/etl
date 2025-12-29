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
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
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
        <ActionIcon variant="light" onClick={() => setRows([...rows, { key: "", value: "" }])}>
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

export function StreamDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { apiSources, upsertStream, setStreamPreview } = useAppStore();

  const apiOptions = apiSources.map((s) => ({ value: s.id, label: s.name }));
  const defaultApi = apiOptions[0]?.value ?? "";

  const [form, setForm] = useState({
    apiSourceId: defaultApi,
    name: "List Items",
    method: "GET" as "GET" | "POST",
    path: "/v1/items",
  });

  const [queryParams, setQueryParams] = useState<KV[]>([{ key: "limit", value: "100" }]);
  const [headers, setHeaders] = useState<KV[]>([]);
  const [bodyTemplate, setBodyTemplate] = useState<string>('{\n  "since": "{{cursor}}"\n}');
  const [pagination, setPagination] = useState<
    { type: "none" } |
    { type: "page"; pageParam: string; sizeParam?: string; pageStart: number; pageSize?: number } |
    { type: "cursor"; cursorParam: string; cursorPathInResponse: string }
  >({ type: "page", pageParam: "page", sizeParam: "limit", pageStart: 1, pageSize: 100 });

  const [previewText, setPreviewText] = useState<string>(
    JSON.stringify(
      {
        data: [
          { id: "a1", name: "Widget", price: 12.5, tags: ["new"], created_at: "2025-12-01T12:00:00Z" },
          { id: "a2", name: "Gadget", price: 7.0, tags: ["sale"], created_at: "2025-12-02T12:00:00Z" },
        ],
        next_cursor: "abc123",
      },
      null,
      2
    )
  );

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
        apiSourceId: z.string().min(1),
        name: z.string().min(2),
        method: z.enum(["GET", "POST"]),
        path: z.string().min(1),
      }).parse(form);

      const cleanKV = (rows: KV[]) => rows.filter((r) => r.key.trim().length > 0);

      const stream = {
        ...form,
        queryParams: cleanKV(queryParams),
        headers: cleanKV(headers),
        bodyTemplate: form.method === "POST" ? bodyTemplate : undefined,
        pagination,
      };

      // save stream first
      upsertStream(stream);

      // then save preview + inferred schema (if valid)
      if (parsedPreview.ok && inferred) {
        // we need the created stream id; in this prototype we re-find by name+path+source (good enough)
        const created = useAppStore.getState().streams
          .slice()
          .reverse()
          .find((s) => s.name === stream.name && s.path === stream.path && s.apiSourceId === stream.apiSourceId);

        if (created) setStreamPreview(created.id, parsedPreview.json, inferred);
      }

      notifications.show({ message: "Stream saved", color: "teal" });
      onClose();
    } catch (e: any) {
      notifications.show({ message: e?.message ?? "Validation error", color: "red" });
    }
  };

  const mockRegenerate = () => {
    setPreviewText(
      JSON.stringify(
        {
          items: [
            { id: 1, email: "a@example.com", active: true, meta: { plan: "pro", seats: 3 } },
            { id: 2, email: "b@example.com", active: false, meta: { plan: "free", seats: 1 } },
          ],
          pagination: { next: "cursor_002" },
        },
        null,
        2
      )
    );
    notifications.show({ message: "Mock preview JSON generated", color: "blue" });
  };

  return (
    <Drawer opened={opened} onClose={onClose} title="Add stream" position="right" size="xl">
      <Stack>
        {apiSources.length === 0 ? (
          <Badge color="yellow" variant="light">
            Create an API Source first.
          </Badge>
        ) : (
          <Tabs defaultValue="request">
            <Tabs.List>
              <Tabs.Tab value="request">Request</Tabs.Tab>
              <Tabs.Tab value="preview">Preview & Schema</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="request" pt="md">
              <Stack>
                <SimpleGrid cols={2}>
                  <Select
                    label="API Source"
                    data={apiOptions}
                    value={form.apiSourceId}
                    onChange={(v) => setForm({ ...form, apiSourceId: (v as any) ?? "" })}
                  />
                  <Select
                    label="Method"
                    data={[
                      { value: "GET", label: "GET" },
                      { value: "POST", label: "POST" },
                    ]}
                    value={form.method}
                    onChange={(v) => setForm({ ...form, method: (v as any) ?? "GET" })}
                  />
                </SimpleGrid>

                <TextInput label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <TextInput
                  label="Path"
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  description="Relative to the API Source base URL"
                />

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
                    if (type === "page") setPagination({ type: "page", pageParam: "page", sizeParam: "limit", pageStart: 1, pageSize: 100 });
                    if (type === "cursor") setPagination({ type: "cursor", cursorParam: "cursor", cursorPathInResponse: "next_cursor" });
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
                      onChange={(e) => setPagination({ ...pagination, pageParam: e.target.value })}
                    />
                    <TextInput
                      label="Size param"
                      value={pagination.sizeParam ?? ""}
                      onChange={(e) => setPagination({ ...pagination, sizeParam: e.target.value })}
                    />
                    <TextInput
                      label="Start page"
                      value={String(pagination.pageStart)}
                      onChange={(e) => setPagination({ ...pagination, pageStart: Number(e.target.value || 1) })}
                    />
                    <TextInput
                      label="Page size"
                      value={String(pagination.pageSize ?? "")}
                      onChange={(e) => setPagination({ ...pagination, pageSize: Number(e.target.value || 100) })}
                    />
                  </SimpleGrid>
                )}

                {pagination.type === "cursor" && (
                  <SimpleGrid cols={2}>
                    <TextInput
                      label="Cursor param"
                      value={pagination.cursorParam}
                      onChange={(e) => setPagination({ ...pagination, cursorParam: e.target.value })}
                    />
                    <TextInput
                      label="Cursor path in response"
                      value={pagination.cursorPathInResponse}
                      onChange={(e) => setPagination({ ...pagination, cursorPathInResponse: e.target.value })}
                      description='Example: "next_cursor" or "pagination.next"'
                    />
                  </SimpleGrid>
                )}

                <Group justify="flex-end">
                  <Button variant="light" onClick={onClose}>Cancel</Button>
                  <Button onClick={saveStream}>Save stream</Button>
                </Group>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="preview" pt="md">
              <Group justify="space-between" mb="sm">
                <Badge variant="light">Paste or generate a sample response JSON</Badge>
                <Button leftSection={<IconWand size={16} />} variant="light" onClick={mockRegenerate}>
                  Generate mock
                </Button>
              </Group>

              <JsonPreviewPanel
                value={previewText}
                onChange={setPreviewText}
                parseError={parsedPreview.ok ? undefined : parsedPreview.error}
                inferredSchemaText={inferred ? schemaToPretty(inferred) : undefined}
              />
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </Drawer>
  );
}
