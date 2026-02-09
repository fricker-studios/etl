import {
  Drawer,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Divider,
  Text,
  Collapse,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { z } from "zod";
import { IconFileImport, IconFileExport, IconX } from "@tabler/icons-react";
import {
  SchemaColumnEditor,
  type SchemaColumn,
} from "../../components/common/SchemaColumnEditor";
import { useCreateTopic } from "../../hooks/useTopics";

interface TopicDrawerProps {
  opened: boolean;
  onClose: () => void;
  onTopicCreated?: (topicId: string) => void;
  initialSchema?: SchemaColumn[]; // Pre-populated schema from Stream
  initialName?: string; // Pre-populated name from Stream
}

export function TopicDrawer({
  opened,
  onClose,
  onTopicCreated,
  initialSchema,
  initialName,
}: TopicDrawerProps) {
  const createTopic = useCreateTopic();

  const [form, setForm] = useState({
    name: initialName || "",
    description: "",
  });

  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>(
    initialSchema && initialSchema.length > 0
      ? initialSchema
      : [{ name: "", position: 0, data_type: "string", nullable: true }]
  );

  const [schemaJson, setSchemaJson] = useState<string>("");
  const [showJsonImport, setShowJsonImport] = useState(false);

  const importSchemaFromJson = () => {
    try {
      const parsed = JSON.parse(schemaJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Schema must be an array");
      }

      const imported: SchemaColumn[] = parsed.map((col: any, idx: number) => ({
        name: col.name || "",
        position: col.position !== undefined ? col.position : idx,
        data_type: col.data_type || col.type || "string",
        nullable: col.nullable !== undefined ? col.nullable : true,
      }));

      setSchemaColumns(imported);
      setShowJsonImport(false);
      setSchemaJson("");

      notifications.show({
        message: `Imported ${imported.length} column(s) from JSON`,
        color: "teal",
      });
    } catch (e: any) {
      notifications.show({
        message: e?.message ?? "Invalid JSON format",
        color: "red",
      });
    }
  };

  const exportSchemaToJson = () => {
    const json = JSON.stringify(schemaColumns, null, 2);
    navigator.clipboard.writeText(json);
    notifications.show({
      message: "Schema copied to clipboard as JSON",
      color: "teal",
    });
  };

  const saveTopic = async () => {
    try {
      // Validate form
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
      }).parse(form);

      // Validate schema - at least one column with a name
      const validColumns = schemaColumns.filter(
        (col) => col.name.trim().length > 0,
      );
      if (validColumns.length === 0) {
        throw new Error("At least one schema column is required");
      }

      // Create topic with initial revision
      const topicData = {
        name: form.name,
        description: form.description || null,
      };

      const createdTopicId = await createTopic.mutateAsync({
        topic: topicData,
        schema: validColumns,
      });

      // Reset form
      setForm({ name: "", description: "" });
      setSchemaColumns([
        { name: "", position: 0, data_type: "string", nullable: true },
      ]);

      // Call callback if provided
      if (onTopicCreated && createdTopicId) {
        onTopicCreated(createdTopicId);
      }

      onClose();
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
      title="Create Topic"
      position="right"
      size="lg"
    >
      <Stack>
        <TextInput
          label="Topic Name"
          placeholder="e.g., Customer Events"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <Textarea
          label="Description"
          placeholder="Describe what this topic contains..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          minRows={3}
        />

        <Divider label="Schema Definition" />

        <Text size="sm" c="dimmed">
          Define the schema for this topic. This will create the initial
          revision (v1).
        </Text>

        <Group>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconFileImport size={14} />}
            onClick={() => setShowJsonImport(!showJsonImport)}
          >
            {showJsonImport ? "Hide" : "Import JSON"}
          </Button>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconFileExport size={14} />}
            onClick={exportSchemaToJson}
          >
            Copy as JSON
          </Button>
        </Group>

        <Collapse in={showJsonImport}>
          <Stack gap="xs">
            <Textarea
              label="Schema JSON"
              placeholder='[{"name": "id", "data_type": "string", "nullable": false}, ...]'
              value={schemaJson}
              onChange={(e) => setSchemaJson(e.target.value)}
              minRows={4}
            />
            <Group>
              <Button size="xs" onClick={importSchemaFromJson}>
                Import
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setShowJsonImport(false);
                  setSchemaJson("");
                }}
                leftSection={<IconX size={14} />}
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        </Collapse>

        <SchemaColumnEditor
          columns={schemaColumns}
          onChange={setSchemaColumns}
        />

        <Divider />

        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={saveTopic}>Create Topic</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
