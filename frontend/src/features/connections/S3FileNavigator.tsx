import {
  Card,
  Table,
  Text,
  Group,
  ActionIcon,
  Loader,
  Center,
  Breadcrumbs,
  Anchor,
  Badge,
  Stack,
} from "@mantine/core";
import { IconFolder, IconFile, IconArrowLeft } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { api } from "../../utils/api";
import { notifications } from "@mantine/notifications";

interface S3Item {
  name: string;
  type: "file" | "folder";
  key?: string;
  prefix?: string;
  size?: number;
  last_modified?: string;
}

interface S3NavigatorProps {
  storageBackendId: string;
  bucket: string;
}

export function S3FileNavigator({ storageBackendId, bucket }: S3NavigatorProps) {
  const [loading, setLoading] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [folders, setFolders] = useState<S3Item[]>([]);
  const [files, setFiles] = useState<S3Item[]>([]);
  const [pathStack, setPathStack] = useState<string[]>([]);

  useEffect(() => {
    loadFiles(currentPrefix);
  }, [currentPrefix, storageBackendId]);

  const loadFiles = async (prefix: string) => {
    setLoading(true);
    try {
      const response = await api.storageBackends.browseS3(storageBackendId, prefix);
      setFolders(response.folders || []);
      setFiles(response.files || []);
    } catch (error) {
      notifications.show({
        message: (error as Error)?.message || "Failed to load S3 files",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (prefix: string) => {
    setPathStack([...pathStack, currentPrefix]);
    setCurrentPrefix(prefix);
  };

  const navigateBack = () => {
    if (pathStack.length > 0) {
      const previousPath = pathStack[pathStack.length - 1];
      setPathStack(pathStack.slice(0, -1));
      setCurrentPrefix(previousPath);
    }
  };

  const navigateToPath = (index: number) => {
    if (index === -1) {
      setPathStack([]);
      setCurrentPrefix("");
    } else {
      const targetPath = pathStack[index];
      setPathStack(pathStack.slice(0, index));
      setCurrentPrefix(targetPath);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getBreadcrumbItems = () => {
    const items = [
      <Anchor
        key="root"
        onClick={() => navigateToPath(-1)}
        style={{ cursor: "pointer" }}
      >
        {bucket}
      </Anchor>
    ];

    const pathParts = currentPrefix.split("/").filter(p => p);
    pathParts.forEach((part, index) => {
      items.push(
        <Anchor
          key={index}
          onClick={() => navigateToPath(index)}
          style={{ cursor: "pointer" }}
        >
          {part}
        </Anchor>
      );
    });

    return items;
  };

  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="lg" fw={600}>S3 File Navigator</Text>
          {pathStack.length > 0 && (
            <ActionIcon
              onClick={navigateBack}
              variant="light"
              title="Go back"
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
          )}
        </Group>

        <Breadcrumbs>{getBreadcrumbItems()}</Breadcrumbs>

        {loading ? (
          <Center p="xl">
            <Loader size="sm" />
          </Center>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>Last Modified</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {folders.length === 0 && files.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center">
                      No files or folders found
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                <>
                  {folders.map((folder) => (
                    <Table.Tr
                      key={folder.prefix}
                      onClick={() => navigateToFolder(folder.prefix!)}
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>
                        <Group gap="xs">
                          <IconFolder size={16} />
                          <Text>{folder.name}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="blue">
                          Folder
                        </Badge>
                      </Table.Td>
                      <Table.Td>—</Table.Td>
                      <Table.Td>—</Table.Td>
                    </Table.Tr>
                  ))}
                  {files.map((file) => (
                    <Table.Tr key={file.key}>
                      <Table.Td>
                        <Group gap="xs">
                          <IconFile size={16} />
                          <Text>{file.name}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light">File</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{file.size ? formatSize(file.size) : "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {file.last_modified ? formatDate(file.last_modified) : "—"}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
