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
  Pagination,
  Tooltip,
} from "@mantine/core";
import {
  IconFolder,
  IconFile,
  IconArrowLeft,
  IconTrash,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { api } from "../../utils/api";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";

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

export function S3FileNavigator({
  storageBackendId,
  bucket,
}: S3NavigatorProps) {
  const [loading, setLoading] = useState(false);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [folders, setFolders] = useState<S3Item[]>([]);
  const [files, setFiles] = useState<S3Item[]>([]);
  const [pathStack, setPathStack] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    loadFiles(currentPrefix);
  }, [currentPrefix, storageBackendId]);

  useEffect(() => {
    // Reset to page 1 when navigating to a new folder
    setCurrentPage(1);
  }, [currentPrefix]);

  const loadFiles = async (prefix: string) => {
    setLoading(true);
    try {
      const response: any = await api.storageBackends.browseS3(
        storageBackendId,
        prefix,
      );
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

  const handleDeleteFile = (file: S3Item) => {
    modals.openConfirmModal({
      title: "Delete File",
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{file.name}</strong>? This
          action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api.storageBackends.deleteS3File(storageBackendId, file.key!);
          notifications.show({
            message: "File deleted successfully",
            color: "teal",
          });
          // Reload the current folder
          loadFiles(currentPrefix);
        } catch (error) {
          notifications.show({
            message: (error as Error)?.message || "Failed to delete file",
            color: "red",
          });
        }
      },
    });
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
      </Anchor>,
    ];

    const pathParts = currentPrefix.split("/").filter((p) => p);
    pathParts.forEach((part, index) => {
      items.push(
        <Anchor
          key={index}
          onClick={() => navigateToPath(index)}
          style={{ cursor: "pointer" }}
        >
          {part}
        </Anchor>,
      );
    });

    return items;
  };

  // Pagination logic
  const allItems = [...folders, ...files];
  const totalPages = Math.ceil(allItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFolders = folders.slice(
    Math.max(0, startIndex),
    Math.min(folders.length, endIndex),
  );
  const filesStartIndex = Math.max(0, startIndex - folders.length);
  const filesEndIndex = Math.max(0, endIndex - folders.length);
  const paginatedFiles = files.slice(filesStartIndex, filesEndIndex);

  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="lg" fw={600}>
            S3 File Navigator
          </Text>
          {pathStack.length > 0 && (
            <ActionIcon onClick={navigateBack} variant="light" title="Go back">
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
          <>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Last Modified</Table.Th>
                  <Table.Th style={{ width: "80px" }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {allItems.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center">
                        No files or folders found
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  <>
                    {paginatedFolders.map((folder) => (
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
                        <Table.Td>—</Table.Td>
                      </Table.Tr>
                    ))}
                    {paginatedFiles.map((file) => (
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
                          <Text size="sm">
                            {file.size ? formatSize(file.size) : "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {file.last_modified
                              ? formatDate(file.last_modified)
                              : "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Tooltip label="Delete file">
                            <ActionIcon
                              color="red"
                              variant="light"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(file);
                              }}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </>
                )}
              </Table.Tbody>
            </Table>

            {totalPages > 1 && (
              <Group justify="center" mt="md">
                <Pagination
                  total={totalPages}
                  value={currentPage}
                  onChange={setCurrentPage}
                  size="sm"
                />
                <Text size="sm" c="dimmed">
                  Showing {startIndex + 1}-{Math.min(endIndex, allItems.length)}{" "}
                  of {allItems.length} items
                </Text>
              </Group>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}
