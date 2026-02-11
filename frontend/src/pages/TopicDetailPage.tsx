import {
  Card,
  Text,
  Stack,
  Badge,
  Accordion,
  Table,
  Pagination,
  Loader,
  Center,
  ActionIcon,
  Tooltip,
  Group,
  Button,
  Breadcrumbs,
  Anchor,
  TextInput,
  Select,
  Modal,
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconArrowLeft,
  IconSearch,
  IconDownload,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import type { DataPackage } from "../store/useAppStore";
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { TopicRevisionDrawer } from "../features/sources/TopicRevisionDrawer";
import { modals } from "@mantine/modals";
import { PageHeader } from "../components/common/PageHeader";
import { useTopic, useDeleteTopic } from "../hooks/useTopics";
import { api } from "../utils/api";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";

export function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: topic, isLoading } = useTopic(id ?? null);
  const deleteTopic = useDeleteTopic();
  const queryClient = useQueryClient();

  const [selectedRevision, setSelectedRevision] = useState<string | null>(null);
  const [
    revisionDrawerOpen,
    { open: openRevisionDrawer, close: closeRevisionDrawer },
  ] = useDisclosure(false);
  const [revisionPackages, setRevisionPackages] = useState<
    Record<string, DataPackage[]>
  >({});
  const [revisionPackagesPage, setRevisionPackagesPage] = useState<
    Record<string, number>
  >({});
  const [loadingPackages, setLoadingPackages] = useState<
    Record<string, boolean>
  >({});
  const [packageSearchQuery, setPackageSearchQuery] = useState<
    Record<string, string>
  >({});
  const [packageStatusFilter, setPackageStatusFilter] = useState<
    Record<string, string>
  >({});
  const [packageSortField, setPackageSortField] = useState<
    Record<string, string>
  >({});
  const [packageSortOrder, setPackageSortOrder] = useState<
    Record<string, "asc" | "desc">
  >({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<DataPackage | null>(
    null,
  );

  const packagesPerPage = 10;

  const handleCreateRevision = () => {
    openRevisionDrawer();
  };

  const loadPackagesForRevision = async (revisionId: string) => {
    setLoadingPackages((prev) => ({ ...prev, [revisionId]: true }));
    try {
      const response = await api.packages.list({ topic_revision: revisionId });
      const packages = response as DataPackage[];
      setRevisionPackages((prev) => ({ ...prev, [revisionId]: packages }));
      setRevisionPackagesPage((prev) => ({ ...prev, [revisionId]: 1 }));
    } catch (error) {
      console.error("Failed to load packages:", error);
    } finally {
      setLoadingPackages((prev) => ({ ...prev, [revisionId]: false }));
    }
  };

  const getFilteredAndSortedPackages = (revisionId: string) => {
    let packages = revisionPackages[revisionId] || [];

    // Apply search filter
    const searchQuery = packageSearchQuery[revisionId]?.toLowerCase() || "";
    if (searchQuery) {
      packages = packages.filter((pkg) =>
        pkg.name.toLowerCase().includes(searchQuery),
      );
    }

    // Apply status filter
    const statusFilter = packageStatusFilter[revisionId];
    if (statusFilter && statusFilter !== "all") {
      packages = packages.filter((pkg) => pkg.status === statusFilter);
    }

    // Apply sorting
    const sortField = packageSortField[revisionId] || "created_at";
    const sortOrder = packageSortOrder[revisionId] || "desc";

    packages = [...packages].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "file_size_bytes":
          aVal = a.file_size_bytes || 0;
          bVal = b.file_size_bytes || 0;
          break;
        case "created_at":
        default:
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === "asc"
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });

    return packages;
  };

  const getPackagesForRevision = (revisionId: string, page: number) => {
    const packages = getFilteredAndSortedPackages(revisionId);
    const start = (page - 1) * packagesPerPage;
    const end = start + packagesPerPage;
    return packages.slice(start, end);
  };

  const getTotalPagesForRevision = (revisionId: string) => {
    const packages = getFilteredAndSortedPackages(revisionId);
    return Math.ceil(packages.length / packagesPerPage);
  };

  const handleDownloadPackage = async (pkg: DataPackage) => {
    try {
      if (!pkg.file_path) {
        notifications.show({
          message: "No file available for download",
          color: "orange",
        });
        return;
      }

      // Fetch the presigned download URL from the API
      const response: any = await api.packages.download(pkg.id);

      if (response.download_url) {
        // Open the presigned URL in a new tab
        window.open(response.download_url, "_blank");
        notifications.show({
          message: "Download started",
          color: "teal",
        });
      } else {
        notifications.show({
          message: "Failed to get download URL",
          color: "red",
        });
      }
    } catch (error) {
      notifications.show({
        message: (error as Error)?.message || "Failed to download package",
        color: "red",
      });
    }
  };

  const handleDeletePackage = (pkg: DataPackage) => {
    setPackageToDelete(pkg);
    setDeleteModalOpen(true);
  };

  const confirmDeletePackage = async () => {
    if (!packageToDelete) return;

    try {
      await api.packages.delete(String(packageToDelete.id));
      notifications.show({
        message: "Package deleted successfully",
        color: "teal",
      });

      // Refresh packages for the revision
      const revisionId = String(packageToDelete.topic_revision);
      await loadPackagesForRevision(revisionId);

      // Refresh topic to update package counts
      queryClient.invalidateQueries({ queryKey: ["topics", id] });

      setDeleteModalOpen(false);
      setPackageToDelete(null);
    } catch (error) {
      notifications.show({
        message: (error as Error)?.message || "Failed to delete package",
        color: "red",
      });
    }
  };

  const handleSortChange = (revisionId: string, field: string) => {
    const currentField = packageSortField[revisionId] || "created_at";
    const currentOrder = packageSortOrder[revisionId] || "desc";

    if (currentField === field) {
      // Toggle sort order
      setPackageSortOrder((prev) => ({
        ...prev,
        [revisionId]: currentOrder === "asc" ? "desc" : "asc",
      }));
    } else {
      // New field, default to ascending
      setPackageSortField((prev) => ({ ...prev, [revisionId]: field }));
      setPackageSortOrder((prev) => ({ ...prev, [revisionId]: "asc" }));
    }

    // Reset to first page when sorting changes
    setRevisionPackagesPage((prev) => ({ ...prev, [revisionId]: 1 }));
  };

  const handleDeleteTopic = () => {
    if (!topic) return;

    modals.openConfirmModal({
      title: "Delete Topic",
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{topic.name}</strong>? This
          will delete all revisions and associated data packages. This action
          cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        deleteTopic.mutate(String(topic.id), {
          onSuccess: () => {
            navigate("/topics");
          },
        });
      },
    });
  };

  const handleDeleteRevision = (revisionId: string, revisionNumber: number) => {
    modals.openConfirmModal({
      title: "Delete Topic Revision",
      children: (
        <Text size="sm">
          Are you sure you want to delete{" "}
          <strong>Revision {revisionNumber}</strong>? This will delete all data
          packages associated with this revision. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await api.topicRevisions.delete(revisionId);
          notifications.show({
            message: "Revision deleted successfully",
            color: "teal",
          });
          // Refresh the topic to update the UI
          queryClient.invalidateQueries({ queryKey: ["topics", id] });
        } catch (error) {
          notifications.show({
            message: (error as Error)?.message || "Failed to delete revision",
            color: "red",
          });
        }
      },
    });
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader />
      </Center>
    );
  }

  if (!topic) {
    return (
      <Stack>
        <Text>Topic not found</Text>
        <Button
          component={Link}
          to="/topics"
          leftSection={<IconArrowLeft size={16} />}
        >
          Back to Topics
        </Button>
      </Stack>
    );
  }

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/topics">
          Topics
        </Anchor>
        <Text>{topic.name}</Text>
      </Breadcrumbs>

      <PageHeader
        title={topic.name}
        description={topic.description || "No description provided"}
        action={{
          label: "Delete Topic",
          onClick: handleDeleteTopic,
          icon: <IconTrash size={16} />,
        }}
      />

      {/* Topic Statistics */}
      <Card withBorder>
        <Stack gap="md">
          <Text size="sm" fw={500}>
            Topic Statistics
          </Text>
          <Group>
            <Badge variant="light" size="lg">
              {topic.revisions?.length || 0} revision
              {topic.revisions?.length !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="light" color="blue" size="lg">
              {topic.total_packages || 0} package
              {topic.total_packages !== 1 ? "s" : ""}
            </Badge>
          </Group>
          <Group>
            <Text size="sm" c="dimmed">
              Created: {new Date(topic.created_at).toLocaleString()}
            </Text>
            <Text size="sm" c="dimmed">
              Updated: {new Date(topic.updated_at).toLocaleString()}
            </Text>
          </Group>
        </Stack>
      </Card>

      {/* Revisions Section */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="lg" fw={600}>
              Revisions
            </Text>
            <Button
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={handleCreateRevision}
            >
              Create New Revision
            </Button>
          </Group>

          {topic.revisions && topic.revisions.length > 0 ? (
            <Accordion value={selectedRevision} onChange={setSelectedRevision}>
              {topic.revisions.map((revision) => {
                const revisionId = String(revision.id);
                const currentPage = revisionPackagesPage[revisionId] || 1;
                const packages = getPackagesForRevision(
                  revisionId,
                  currentPage,
                );
                const totalPages = getTotalPagesForRevision(revisionId);
                const isLoadingPkgs = loadingPackages[revisionId];

                return (
                  <Accordion.Item key={revision.id} value={revisionId}>
                    <Accordion.Control
                      onClick={() => {
                        if (!revisionPackages[revisionId]) {
                          loadPackagesForRevision(revisionId);
                        }
                      }}
                    >
                      <Group justify="space-between">
                        <Text fw={500}>
                          Revision {revision.revision_number}
                        </Text>
                        <Group>
                          <Badge variant="light">
                            {revision.package_count || 0} packages
                          </Badge>
                          <Tooltip label="Delete revision">
                            <ActionIcon
                              color="red"
                              variant="light"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRevision(
                                  revisionId,
                                  revision.revision_number,
                                );
                              }}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        {revision.change_description && (
                          <Text size="sm" c="dimmed">
                            {revision.change_description}
                          </Text>
                        )}

                        {revision.schema && revision.schema.length > 0 && (
                          <div>
                            <Text size="sm" fw={500} mb="xs">
                              Schema:
                            </Text>
                            <Table highlightOnHover>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>Position</Table.Th>
                                  <Table.Th>Column Name</Table.Th>
                                  <Table.Th>Data Type</Table.Th>
                                  <Table.Th>Nullable</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {[...revision.schema]
                                  .sort((a, b) => a.position - b.position)
                                  .map((col) => (
                                    <Table.Tr key={col.position}>
                                      <Table.Td>{col.position}</Table.Td>
                                      <Table.Td>
                                        <Text fw={500}>{col.name}</Text>
                                      </Table.Td>
                                      <Table.Td>
                                        <Badge size="sm" variant="light">
                                          {col.data_type}
                                        </Badge>
                                      </Table.Td>
                                      <Table.Td>
                                        {col.nullable ? (
                                          <Text c="dimmed" size="sm">
                                            Yes
                                          </Text>
                                        ) : (
                                          <Text fw={500} size="sm">
                                            No
                                          </Text>
                                        )}
                                      </Table.Td>
                                    </Table.Tr>
                                  ))}
                              </Table.Tbody>
                            </Table>
                          </div>
                        )}

                        {/* Packages for this revision */}
                        <div>
                          <Text size="sm" fw={500} mb="xs" mt="md">
                            Packages:
                          </Text>
                          {isLoadingPkgs ? (
                            <Center p="xl">
                              <Loader size="sm" />
                            </Center>
                          ) : revisionPackages[revisionId] &&
                            revisionPackages[revisionId].length > 0 ? (
                            <>
                              {/* Search, Filter, and Sort Controls */}
                              <Group mb="md" align="flex-end">
                                <TextInput
                                  placeholder="Search packages..."
                                  leftSection={<IconSearch size={16} />}
                                  value={packageSearchQuery[revisionId] || ""}
                                  onChange={(e) => {
                                    setPackageSearchQuery((prev) => ({
                                      ...prev,
                                      [revisionId]: e.target.value,
                                    }));
                                    setRevisionPackagesPage((prev) => ({
                                      ...prev,
                                      [revisionId]: 1,
                                    }));
                                  }}
                                  style={{ flex: 1, minWidth: "200px" }}
                                />
                                <Select
                                  placeholder="Filter by status"
                                  value={
                                    packageStatusFilter[revisionId] || "all"
                                  }
                                  onChange={(value) => {
                                    setPackageStatusFilter((prev) => ({
                                      ...prev,
                                      [revisionId]: value || "all",
                                    }));
                                    setRevisionPackagesPage((prev) => ({
                                      ...prev,
                                      [revisionId]: 1,
                                    }));
                                  }}
                                  data={[
                                    { value: "all", label: "All Statuses" },
                                    { value: "draft", label: "Draft" },
                                    { value: "queued", label: "Queued" },
                                    {
                                      value: "materialized",
                                      label: "Materialized",
                                    },
                                    { value: "failed", label: "Failed" },
                                  ]}
                                  style={{ width: "180px" }}
                                />
                              </Group>

                              <Table highlightOnHover>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>
                                      <Group
                                        gap="xs"
                                        style={{ cursor: "pointer" }}
                                        onClick={() =>
                                          handleSortChange(revisionId, "name")
                                        }
                                      >
                                        <Text size="sm">Name</Text>
                                        {packageSortField[revisionId] ===
                                          "name" &&
                                          (packageSortOrder[revisionId] ===
                                          "asc" ? (
                                            <IconSortAscending size={14} />
                                          ) : (
                                            <IconSortDescending size={14} />
                                          ))}
                                      </Group>
                                    </Table.Th>
                                    <Table.Th>
                                      <Group
                                        gap="xs"
                                        style={{ cursor: "pointer" }}
                                        onClick={() =>
                                          handleSortChange(revisionId, "status")
                                        }
                                      >
                                        <Text size="sm">Status</Text>
                                        {packageSortField[revisionId] ===
                                          "status" &&
                                          (packageSortOrder[revisionId] ===
                                          "asc" ? (
                                            <IconSortAscending size={14} />
                                          ) : (
                                            <IconSortDescending size={14} />
                                          ))}
                                      </Group>
                                    </Table.Th>
                                    <Table.Th>
                                      <Group
                                        gap="xs"
                                        style={{ cursor: "pointer" }}
                                        onClick={() =>
                                          handleSortChange(
                                            revisionId,
                                            "file_size_bytes",
                                          )
                                        }
                                      >
                                        <Text size="sm">File Size</Text>
                                        {packageSortField[revisionId] ===
                                          "file_size_bytes" &&
                                          (packageSortOrder[revisionId] ===
                                          "asc" ? (
                                            <IconSortAscending size={14} />
                                          ) : (
                                            <IconSortDescending size={14} />
                                          ))}
                                      </Group>
                                    </Table.Th>
                                    <Table.Th>
                                      <Group
                                        gap="xs"
                                        style={{ cursor: "pointer" }}
                                        onClick={() =>
                                          handleSortChange(
                                            revisionId,
                                            "created_at",
                                          )
                                        }
                                      >
                                        <Text size="sm">Created</Text>
                                        {packageSortField[revisionId] ===
                                          "created_at" &&
                                          (packageSortOrder[revisionId] ===
                                          "asc" ? (
                                            <IconSortAscending size={14} />
                                          ) : (
                                            <IconSortDescending size={14} />
                                          ))}
                                      </Group>
                                    </Table.Th>
                                    <Table.Th>Actions</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {packages.map((pkg) => (
                                    <Table.Tr key={pkg.id}>
                                      <Table.Td>
                                        <Text size="sm">{pkg.name}</Text>
                                      </Table.Td>
                                      <Table.Td>
                                        <Badge
                                          size="sm"
                                          color={
                                            pkg.status === "materialized"
                                              ? "green"
                                              : pkg.status === "failed"
                                                ? "red"
                                                : "blue"
                                          }
                                        >
                                          {pkg.status}
                                        </Badge>
                                      </Table.Td>
                                      <Table.Td>
                                        <Text size="sm" c="dimmed">
                                          {pkg.file_size_bytes
                                            ? `${(pkg.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                                            : "-"}
                                        </Text>
                                      </Table.Td>
                                      <Table.Td>
                                        <Text size="sm" c="dimmed">
                                          {new Date(
                                            pkg.created_at,
                                          ).toLocaleDateString()}
                                        </Text>
                                      </Table.Td>
                                      <Table.Td>
                                        <Group gap="xs">
                                          <Tooltip label="Download package">
                                            <ActionIcon
                                              color="blue"
                                              variant="light"
                                              size="sm"
                                              onClick={() =>
                                                handleDownloadPackage(pkg)
                                              }
                                              disabled={!pkg.file_path}
                                            >
                                              <IconDownload size={14} />
                                            </ActionIcon>
                                          </Tooltip>
                                          <Tooltip label="Delete package">
                                            <ActionIcon
                                              color="red"
                                              variant="light"
                                              size="sm"
                                              onClick={() =>
                                                handleDeletePackage(pkg)
                                              }
                                            >
                                              <IconTrash size={14} />
                                            </ActionIcon>
                                          </Tooltip>
                                        </Group>
                                      </Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                              {totalPages > 1 && (
                                <Group justify="center" mt="md">
                                  <Pagination
                                    total={totalPages}
                                    value={currentPage}
                                    onChange={(page) => {
                                      setRevisionPackagesPage((prev) => ({
                                        ...prev,
                                        [revisionId]: page,
                                      }));
                                    }}
                                    size="sm"
                                  />
                                </Group>
                              )}
                            </>
                          ) : (
                            <Text size="sm" c="dimmed">
                              No packages yet for this revision.
                            </Text>
                          )}
                        </div>

                        <Text size="xs" c="dimmed">
                          Created:{" "}
                          {new Date(revision.created_at).toLocaleString()}
                        </Text>
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          ) : (
            <Text c="dimmed" size="sm">
              No revisions yet for this topic.
            </Text>
          )}
        </Stack>
      </Card>

      <TopicRevisionDrawer
        opened={revisionDrawerOpen}
        onClose={closeRevisionDrawer}
        topic={topic}
      />

      {/* Delete Package Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setPackageToDelete(null);
        }}
        title="Delete Package"
        centered
      >
        <Stack>
          <Text size="sm">
            Are you sure you want to delete package{" "}
            <strong>{packageToDelete?.name}</strong>? This action cannot be
            undone.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                setDeleteModalOpen(false);
                setPackageToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button color="red" onClick={confirmDeletePackage}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
