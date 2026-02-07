import {
  Drawer,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Divider,
  Text,
  ActionIcon,
  Table,
  Select,
  NumberInput,
  Switch,
} from "@mantine/core";
import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { z } from "zod";

interface SchemaColumn {
  name: string;
  position: number;
  data_type: string;
  nullable: boolean;
}

interface TopicDrawerProps {
  opened: boolean;
  onClose: () => void;
  onTopicCreated?: (topicId: string) => void;
}

export function TopicDrawer({ opened, onClose, onTopicCreated }: TopicDrawerProps) {
  const { addTopic } = useAppStore();

  const [form, setForm] = useState({
    name: "",
    description: "",
  });

  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([
    { name: "", position: 1, data_type: "string", nullable: true },
  ]);

  const dataTypes = [
    { value: "string", label: "String" },
    { value: "integer", label: "Integer" },
    { value: "float", label: "Float" },
    { value: "boolean", label: "Boolean" },
    { value: "date", label: "Date" },
    { value: "datetime", label: "DateTime" },
    { value: "timestamp", label: "Timestamp" },
    { value: "json", label: "JSON" },
    { value: "array", label: "Array" },
  ];

  const addColumn = () => {
    const newPosition = schemaColumns.length + 1;
    setSchemaColumns([
      ...schemaColumns,
      { name: "", position: newPosition, data_type: "string", nullable: true },
    ]);
  };

  const removeColumn = (position: number) => {
    const updated = schemaColumns
      .filter((col) => col.position !== position)
      .map((col, idx) => ({ ...col, position: idx + 1 }));
    setSchemaColumns(updated);
  };

  const updateColumn = (position: number, field: keyof SchemaColumn, value: any) => {
    setSchemaColumns(
      schemaColumns.map((col) =>
        col.position === position ? { ...col, [field]: value } : col
      )
    );
  };

  const saveTopic = async () => {
    try {
      // Validate form
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
      }).parse(form);

      // Validate schema - at least one column with a name
      const validColumns = schemaColumns.filter((col) => col.name.trim().length > 0);
      if (validColumns.length === 0) {
        throw new Error("At least one schema column is required");
      }

      // Create topic with initial revision
      const topicData = {
        name: form.name,
        description: form.description || null,
      };

      const createdTopicId = await addTopic(topicData, validColumns);

      notifications.show({
        message: "Topic created successfully",
        color: "teal",
      });

      // Reset form
      setForm({ name: "", description: "" });
      setSchemaColumns([
        { name: "", position: 1, data_type: "string", nullable: true },
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
          Define the schema for this topic. This will create the initial revision (v1).
        </Text>

        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={500} size="sm">
              Columns
            </Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={addColumn}
            >
              Add Column
            </Button>
          </Group>

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: "5%" }}>#</Table.Th>
                <Table.Th style={{ width: "30%" }}>Column Name</Table.Th>
                <Table.Th style={{ width: "25%" }}>Data Type</Table.Th>
                <Table.Th style={{ width: "20%" }}>Nullable</Table.Th>
                <Table.Th style={{ width: "10%" }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {schemaColumns.map((col) => (
                <Table.Tr key={col.position}>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {col.position}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      placeholder="column_name"
                      value={col.name}
                      size="xs"
                      onChange={(e) =>
                        updateColumn(col.position, "name", e.target.value)
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={dataTypes}
                      value={col.data_type}
                      size="xs"
                      onChange={(v) =>
                        updateColumn(col.position, "data_type", v || "string")
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={col.nullable}
                      onChange={(e) =>
                        updateColumn(
                          col.position,
                          "nullable",
                          e.currentTarget.checked
                        )
                      }
                      size="sm"
                    />
                  </Table.Td>
                  <Table.Td>
                    {schemaColumns.length > 1 && (
                      <ActionIcon
                        color="red"
                        variant="light"
                        size="sm"
                        onClick={() => removeColumn(col.position)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>

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
