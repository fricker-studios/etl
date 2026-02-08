import {
  Drawer,
  Stack,
  Textarea,
  Button,
  Group,
  Divider,
  Text,
  ActionIcon,
  Table,
  Select,
  Switch,
  TextInput,
} from "@mantine/core";
import { useState, useEffect } from "react";
import { useAppStore, type Topic } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { z } from "zod";

interface SchemaColumn {
  name: string;
  position: number;
  data_type: string;
  nullable: boolean;
}

interface TopicRevisionDrawerProps {
  opened: boolean;
  onClose: () => void;
  topic: Topic | null;
}

export function TopicRevisionDrawer({
  opened,
  onClose,
  topic,
}: TopicRevisionDrawerProps) {
  const { addTopicRevision } = useAppStore();

  const [changeDescription, setChangeDescription] = useState("");
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([]);

  // Initialize schema from current revision when topic changes
  useEffect(() => {
    if (topic && topic.current_revision && topic.current_revision.schema) {
      setSchemaColumns(
        topic.current_revision.schema.map((col) => ({ ...col }))
      );
    } else {
      setSchemaColumns([
        { name: "", position: 1, data_type: "string", nullable: true },
      ]);
    }
  }, [topic]);

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

  const updateColumn = (
    position: number,
    field: keyof SchemaColumn,
    value: any
  ) => {
    setSchemaColumns(
      schemaColumns.map((col) =>
        col.position === position ? { ...col, [field]: value } : col
      )
    );
  };

  const saveRevision = async () => {
    if (!topic) return;

    try {
      // Validate schema - at least one column with a name
      const validColumns = schemaColumns.filter(
        (col) => col.name.trim().length > 0
      );
      if (validColumns.length === 0) {
        throw new Error("At least one schema column is required");
      }

      // Create new revision
      const maxRevisionNumber = Math.max(
        0,
        ...(topic.revisions?.map((r) => r.revision_number) || [])
      );
      const nextRevisionNumber = maxRevisionNumber + 1;
      const revisionData = {
        topic: topic.id,
        revision_number: nextRevisionNumber,
        schema: validColumns,
        change_description: changeDescription || null,
      };

      await addTopicRevision(revisionData);

      notifications.show({
        message: "Topic revision created successfully",
        color: "teal",
      });

      // Reset form
      setChangeDescription("");

      onClose();
    } catch (e: any) {
      notifications.show({
        message: e?.message ?? "Error creating revision",
        color: "red",
      });
    }
  };

  const handleClose = () => {
    setChangeDescription("");
    onClose();
  };

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      title={`Create New Revision for ${topic?.name || "Topic"}`}
      position="right"
      size="lg"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Create a new schema revision for this topic. This will be revision{" "}
          {(topic?.revisions?.length || 0) + 1}.
        </Text>

        <Textarea
          label="Change Description"
          placeholder="Describe what changed in this revision..."
          value={changeDescription}
          onChange={(e) => setChangeDescription(e.target.value)}
          minRows={3}
        />

        <Divider label="Schema Definition" />

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
          <Button variant="light" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={saveRevision}>Create Revision</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
