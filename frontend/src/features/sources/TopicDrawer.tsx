import {
  Drawer,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Divider,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { z } from "zod";
import {
  SchemaColumnEditor,
  type SchemaColumn,
} from "../../components/common/SchemaColumnEditor";
import { useCreateTopic } from "../../hooks/useTopics";

interface TopicDrawerProps {
  opened: boolean;
  onClose: () => void;
  onTopicCreated?: (topicId: string) => void;
}

export function TopicDrawer({
  opened,
  onClose,
  onTopicCreated,
}: TopicDrawerProps) {
  const createTopic = useCreateTopic();

  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([
    { name: "", position: 0, data_type: "string", nullable: true },
  ]);

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
