import {
  Drawer,
  Stack,
  Text,
  Group,
  Badge,
  Card,
  Table,
  Divider,
  Button,
  Modal,
} from "@mantine/core";
import { useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useAppStore, type Stream, type DataSource, type Topic } from "../../store/useAppStore";

interface StreamDetailDrawerProps {
  opened: boolean;
  onClose: () => void;
  stream: Stream | null;
}

export function StreamDetailDrawer({
  opened,
  onClose,
  stream,
}: StreamDetailDrawerProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const { removeStream, dataSources, topics } = useAppStore();

  const dataSource = dataSources.find((s) => String(s.id) === stream?.data_source);
  const topic = topics.find((t) => String(t.id) === stream?.topic);

  const renderField = (label: string, value?: string | number | boolean) => {
    if (value === undefined || value === null || value === "") return null;

    return (
      <Table.Tr>
        <Table.Td style={{ fontWeight: 500, width: "40%" }}>{label}</Table.Td>
        <Table.Td>
          <Text size="sm">{String(value)}</Text>
        </Table.Td>
      </Table.Tr>
    );
  };

  const renderBadgeField = (label: string, value?: string, color?: string) => {
    if (!value) return null;

    return (
      <Table.Tr>
        <Table.Td style={{ fontWeight: 500, width: "40%" }}>{label}</Table.Td>
        <Table.Td>
          <Badge variant="light" color={color}>
            {value}
          </Badge>
        </Table.Td>
      </Table.Tr>
    );
  };

  const handleDelete = async () => {
    if (!stream) return;

    try {
      await removeStream(stream.id);
      notifications.show({
        title: "Success",
        message: "Stream deleted successfully",
        color: "green",
      });
      setDeleteModalOpen(false);
      onClose();
    } catch (error) {
      notifications.show({
        title: "Error",
        message: "Failed to delete stream",
        color: "red",
      });
    }
  };

  if (!stream) return null;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Stream Details"
      position="right"
      size="lg"
    >
      <Stack>
        <Group justify="space-between">
          <div>
            <Text size="xl" fw={600}>
              {stream.name}
            </Text>
            {dataSource && (
              <Badge variant="light" mt="xs">
                {dataSource.type.toUpperCase()}
              </Badge>
            )}
          </div>
        </Group>

        <Divider />

        {/* Basic Information */}
        <Card withBorder>
          <Text fw={500} mb="sm">
            General
          </Text>
          <Table>
            <Table.Tbody>
              {renderField("Data Source", dataSource?.name)}
              {renderField("Topic", topic?.name)}
              {renderBadgeField(
                "Schedule",
                stream.schedule_enabled
                  ? stream.schedule_cron || `Every ${stream.schedule_interval_minutes}m`
                  : "Manual",
                stream.schedule_enabled ? "green" : undefined
              )}
            </Table.Tbody>
          </Table>
        </Card>

        {/* Source-Specific Configuration */}
        {dataSource?.type === "api" && (
          <Card withBorder>
            <Text fw={500} mb="sm">
              API Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderBadgeField("Method", stream.method?.toUpperCase())}
                {renderField("Path", stream.path)}
                {stream.query_params && stream.query_params.length > 0 && (
                  <Table.Tr>
                    <Table.Td style={{ fontWeight: 500 }}>Query Parameters</Table.Td>
                    <Table.Td>
                      <Stack gap="xs">
                        {stream.query_params.map((param: any, idx: number) => (
                          <Text key={idx} size="sm" style={{ fontFamily: "monospace" }}>
                            {param.key}={param.value}
                          </Text>
                        ))}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}
                {stream.headers && stream.headers.length > 0 && (
                  <Table.Tr>
                    <Table.Td style={{ fontWeight: 500 }}>Headers</Table.Td>
                    <Table.Td>
                      <Stack gap="xs">
                        {stream.headers.map((header: any, idx: number) => (
                          <Text key={idx} size="sm" style={{ fontFamily: "monospace" }}>
                            {header.key}={header.value}
                          </Text>
                        ))}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}
                {stream.pagination && stream.pagination.type && (
                  <Table.Tr>
                    <Table.Td style={{ fontWeight: 500 }}>Pagination</Table.Td>
                    <Table.Td>
                      <Badge variant="light">{stream.pagination.type}</Badge>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Card>
        )}

        {dataSource?.type === "database" && (
          <Card withBorder>
            <Text fw={500} mb="sm">
              Database Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderField("Table Name", stream.table_name)}
                {renderBadgeField(
                  "Ingestion Strategy",
                  stream.ingestion_strategy?.replace("_", " ").toUpperCase()
                )}
                {stream.ingestion_strategy === "incremental" &&
                  renderField("Incremental Key", stream.incremental_key)}
              </Table.Tbody>
            </Table>
          </Card>
        )}

        {dataSource?.type === "s3" && (
          <Card withBorder>
            <Text fw={500} mb="sm">
              S3 Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderField("Path Pattern", stream.s3_path_pattern)}
                {renderBadgeField("File Format", stream.s3_file_format?.toUpperCase())}
              </Table.Tbody>
            </Table>
          </Card>
        )}

        {dataSource?.type === "sftp" && (
          <Card withBorder>
            <Text fw={500} mb="sm">
              SFTP Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderField("Path Pattern", stream.sftp_path_pattern)}
                {renderBadgeField("File Format", stream.sftp_file_format?.toUpperCase())}
              </Table.Tbody>
            </Table>
          </Card>
        )}

        {/* Schema Information (for API streams) */}
        {stream.inferred_schema && (
          <Card withBorder>
            <Text fw={500} mb="sm">
              Inferred Schema
            </Text>
            <Badge color="teal" variant="light">
              Schema Available
            </Badge>
          </Card>
        )}

        <Divider />

        <Button
          leftSection={<IconTrash size={16} />}
          color="red"
          variant="light"
          onClick={() => setDeleteModalOpen(true)}
        >
          Delete Stream
        </Button>
      </Stack>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Stream"
      >
        <Stack>
          <Text size="sm">
            Are you sure you want to delete <strong>{stream.name}</strong>?
            This action cannot be undone.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
}
