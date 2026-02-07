import {
  Drawer,
  Stack,
  Text,
  Group,
  Badge,
  ActionIcon,
  Card,
  Table,
  Divider,
  CopyButton,
  Tooltip,
  Button,
  Modal,
} from "@mantine/core";
import { useState, useEffect } from "react";
import {
  IconEye,
  IconEyeOff,
  IconCopy,
  IconCheck,
  IconTrash,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "../../utils/api";
import { useAppStore, type DataSource } from "../../store/useAppStore";

interface DataSourceDetailDrawerProps {
  opened: boolean;
  onClose: () => void;
  dataSource: DataSource | null;
}

export function DataSourceDetailDrawer({
  opened,
  onClose,
  dataSource,
}: DataSourceDetailDrawerProps) {
  const [decryptedData, setDecryptedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const removeDataSource = useAppStore((s) => s.removeDataSource);

  useEffect(() => {
    if (opened && dataSource) {
      setVisibleFields(new Set());
      setDecryptedData(null);
    }
  }, [opened, dataSource]);

  const loadDecryptedData = async () => {
    if (!dataSource) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${api.baseUrl}/data-sources/${dataSource.id}/decrypt/`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        },
      );
      const data = await response.json();
      setDecryptedData(data);
    } catch (error) {
      console.error("Failed to load decrypted data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFieldVisibility = (field: string) => {
    const newVisible = new Set(visibleFields);
    if (newVisible.has(field)) {
      newVisible.delete(field);
    } else {
      newVisible.add(field);
      // Load decrypted data if not already loaded
      if (!decryptedData) {
        loadDecryptedData();
      }
    }
    setVisibleFields(newVisible);
  };

  const renderSensitiveField = (
    label: string,
    field: string,
    value?: string,
  ) => {
    if (!value) return null;

    const isVisible = visibleFields.has(field);
    const displayValue =
      isVisible && decryptedData ? decryptedData[field] : "••••••••";

    return (
      <Table.Tr key={field}>
        <Table.Td style={{ fontWeight: 500 }}>{label}</Table.Td>
        <Table.Td>
          <Group gap="xs">
            <Text size="sm" style={{ fontFamily: "monospace" }}>
              {displayValue}
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={() => toggleFieldVisibility(field)}
              loading={loading && isVisible && !decryptedData}
            >
              {isVisible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </ActionIcon>
            {isVisible && decryptedData && (
              <CopyButton value={decryptedData[field]}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy"}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={copy}
                      color={copied ? "teal" : "gray"}
                    >
                      {copied ? (
                        <IconCheck size={16} />
                      ) : (
                        <IconCopy size={16} />
                      )}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  };

  const renderField = (label: string, value?: string | number) => {
    if (!value) return null;

    return (
      <Table.Tr>
        <Table.Td style={{ fontWeight: 500 }}>{label}</Table.Td>
        <Table.Td>
          <Text size="sm">{value}</Text>
        </Table.Td>
      </Table.Tr>
    );
  };

  const handleDelete = async () => {
    if (!dataSource) return;

    try {
      await removeDataSource(dataSource.id);
      notifications.show({
        title: "Success",
        message: "Data source deleted successfully",
        color: "green",
      });
      setDeleteModalOpen(false);
      onClose();
    } catch (error) {
      notifications.show({
        title: "Error",
        message: "Failed to delete data source",
        color: "red",
      });
    }
  };

  if (!dataSource) return null;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Data Source Details"
      position="right"
      size="lg"
    >
      <Stack>
        <Group justify="space-between">
          <div>
            <Text size="xl" fw={600}>
              {dataSource.name}
            </Text>
            <Badge variant="light" mt="xs">
              {dataSource.type.toUpperCase()}
            </Badge>
          </div>
        </Group>

        <Divider />

        <Card withBorder>
          <Table>
            <Table.Tbody>
              {dataSource.type === "api" && (
                <>
                  {renderField("Base URL", dataSource.base_url)}
                  {renderField(
                    "Authentication",
                    dataSource.auth_type?.toUpperCase(),
                  )}
                  {dataSource.auth_type === "bearer" &&
                    renderSensitiveField(
                      "Bearer Token",
                      "bearer_token",
                      dataSource.bearer_token,
                    )}
                  {dataSource.auth_type === "basic" && (
                    <>
                      {renderField("Username", dataSource.basic_user)}
                      {renderSensitiveField(
                        "Password",
                        "basic_pass",
                        dataSource.basic_pass,
                      )}
                    </>
                  )}
                  {dataSource.auth_type === "header" && (
                    <>
                      {renderField("Header Name", dataSource.header_name)}
                      {renderSensitiveField(
                        "Header Value",
                        "header_value",
                        dataSource.header_value,
                      )}
                    </>
                  )}
                </>
              )}

              {dataSource.type === "database" && (
                <>
                  {renderField(
                    "Database Type",
                    dataSource.database_type?.toUpperCase(),
                  )}
                  {renderField("Host", dataSource.host)}
                  {renderField("Port", dataSource.port)}
                  {renderField("Database Name", dataSource.database_name)}
                  {renderField("Username", dataSource.username)}
                  {renderSensitiveField(
                    "Password",
                    "password",
                    dataSource.password,
                  )}
                </>
              )}

              {dataSource.type === "s3" && (
                <>
                  {renderField("Endpoint", dataSource.s3_endpoint)}
                  {renderField("Region", dataSource.s3_region)}
                  {renderField("Bucket", dataSource.s3_bucket)}
                  {renderField("Access Key", dataSource.s3_access_key)}
                  {renderSensitiveField(
                    "Secret Key",
                    "s3_secret_key",
                    dataSource.s3_secret_key,
                  )}
                </>
              )}

              {dataSource.type === "sftp" && (
                <>
                  {renderField("Host", dataSource.sftp_host)}
                  {renderField("Port", dataSource.sftp_port)}
                  {renderField("Username", dataSource.sftp_username)}
                  {renderSensitiveField(
                    "Password",
                    "sftp_password",
                    dataSource.sftp_password,
                  )}
                  {renderSensitiveField(
                    "SSH Key",
                    "sftp_key",
                    dataSource.sftp_key,
                  )}
                </>
              )}
            </Table.Tbody>
          </Table>
        </Card>

        <Text size="xs" c="dimmed">
          Click the eye icon to reveal sensitive values. Values are encrypted in
          the database.
        </Text>

        <Divider />

        <Button
          leftSection={<IconTrash size={16} />}
          color="red"
          variant="light"
          onClick={() => setDeleteModalOpen(true)}
        >
          Delete Data Source
        </Button>
      </Stack>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Data Source"
      >
        <Stack>
          <Text size="sm">
            Are you sure you want to delete <strong>{dataSource.name}</strong>?
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
