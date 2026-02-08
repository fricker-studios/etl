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
import type { Stream } from "../../store/useAppStore";
import { useDataSources } from "../../hooks/useDataSources";
import { useTopics } from "../../hooks/useTopics";
import { useDeleteStream } from "../../hooks/useStreams";

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
  const { data: dataSources = [] } = useDataSources();
  const { data: topics = [] } = useTopics();
  const deleteStreamMutation = useDeleteStream();

  const dataSource = dataSources.find(
    (s) => String(s.id) === String(stream?.data_source),
  );
  const topic = topics.find((t) => String(t.id) === String(stream?.topic));

  const renderField = (label: string, value?: string | number | boolean, alwaysShow = true) => {
    if (!alwaysShow && (value === undefined || value === null || value === "")) return null;

    return (
      <Table.Tr>
        <Table.Td style={{ fontWeight: 500, width: "40%" }}>{label}</Table.Td>
        <Table.Td>
          <Text size="sm" c={value ? undefined : "dimmed"}>
            {value ? String(value) : "—"}
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  };

  const renderBadgeField = (label: string, value?: string, color?: string, alwaysShow = true) => {
    if (!alwaysShow && !value) return null;

    return (
      <Table.Tr>
        <Table.Td style={{ fontWeight: 500, width: "40%" }}>{label}</Table.Td>
        <Table.Td>
          {value ? (
            <Badge variant="light" color={color}>
              {value}
            </Badge>
          ) : (
            <Text size="sm" c="dimmed">—</Text>
          )}
        </Table.Td>
      </Table.Tr>
    );
  };

  const handleDelete = async () => {
    if (!stream) return;

    deleteStreamMutation.mutate(stream.id, {
      onSuccess: () => {
        setDeleteModalOpen(false);
        onClose();
      },
    });
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
              {renderField("Stream Name", stream.name)}
              {renderField("Data Source", dataSource?.name)}
              {renderBadgeField(
                "Source Type",
                dataSource?.type?.toUpperCase(),
                "blue",
              )}
              {renderField("Destination Topic", topic?.name)}
              {renderBadgeField(
                "Schedule",
                stream.schedule_enabled
                  ? stream.schedule_cron ||
                      `Every ${stream.schedule_interval_minutes}m`
                  : "Manual",
                stream.schedule_enabled ? "green" : undefined,
              )}
            </Table.Tbody>
          </Table>
        </Card>

        {/* Source-Specific Configuration */}
        {(dataSource?.type === "api" || stream.method || stream.path) ? (
          <Card withBorder>
            <Text fw={500} mb="sm">
              API Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderBadgeField("Method", stream.method?.toUpperCase(), undefined, false)}
                {renderField("Path", stream.path, false)}
                {stream.query_params && stream.query_params.length > 0 ? (
                  <Table.Tr>
                    <Table.Td style={{ fontWeight: 500 }}>
                      Query Parameters
                    </Table.Td>
                    <Table.Td>
                      <Stack gap="xs">
                        {stream.query_params.map((param: any, idx: number) => (
                          <Text
                            key={idx}
                            size="sm"
                            style={{ fontFamily: "monospace" }}
                          >
                            {param.key}={param.value}
                          </Text>
                        ))}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
                {stream.headers && stream.headers.length > 0 ? (
                  <Table.Tr>
                    <Table.Td style={{ fontWeight: 500 }}>Headers</Table.Td>
                    <Table.Td>
                      <Stack gap="xs">
                        {stream.headers.map((header: any, idx: number) => (
                          <Text
                            key={idx}
                            size="sm"
                            style={{ fontFamily: "monospace" }}
                          >
                            {header.key}={header.value}
                          </Text>
                        ))}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
                {stream.pagination && stream.pagination.type ? (
                  <Table.Tr>
                    <Table.Td style={{ fontWeight: 500 }}>Pagination</Table.Td>
                    <Table.Td>
                      <Badge variant="light">{stream.pagination.type}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </Table.Tbody>
            </Table>
          </Card>
        ) : null}

        {(dataSource?.type === "database" || stream.table_name) ? (
          <Card withBorder>
            <Text fw={500} mb="sm">
              Database Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderField("Table Name", stream.table_name)}
                {renderBadgeField(
                  "Ingestion Strategy",
                  stream.ingestion_strategy?.replace("_", " ").toUpperCase(),
                  undefined,
                  false
                )}
                {stream.ingestion_strategy === "incremental"
                  ? renderField("Incremental Key", stream.incremental_key, false)
                  : null}
              </Table.Tbody>
            </Table>
          </Card>
        ) : null}

        {(dataSource?.type === "s3" || stream.s3_path_pattern) ? (
          <Card withBorder>
            <Text fw={500} mb="sm">
              S3 Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderField("Path Pattern", stream.s3_path_pattern)}
                {renderBadgeField(
                  "File Format",
                  stream.s3_file_format?.toUpperCase(),
                )}
              </Table.Tbody>
            </Table>
          </Card>
        ) : null}

        {(dataSource?.type === "sftp" || stream.sftp_path_pattern) ? (
          <Card withBorder>
            <Text fw={500} mb="sm">
              SFTP Configuration
            </Text>
            <Table>
              <Table.Tbody>
                {renderField("Path Pattern", stream.sftp_path_pattern)}
                {renderBadgeField(
                  "File Format",
                  stream.sftp_file_format?.toUpperCase(),
                )}
              </Table.Tbody>
            </Table>
          </Card>
        ) : null}

        {/* Schema Information (for API streams) */}
        {stream.inferred_schema ? (
          <Card withBorder>
            <Text fw={500} mb="sm">
              Inferred Schema
            </Text>
            <Badge color="teal" variant="light">
              Schema Available
            </Badge>
          </Card>
        ) : null}

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
            Are you sure you want to delete <strong>{stream.name}</strong>? This
            action cannot be undone.
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
