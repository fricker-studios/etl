import {
  Card,
  Group,
  Title,
  Text,
  Stack,
  Button,
  Badge,
  Accordion,
  Table,
  Pagination,
  Loader,
  Center,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useAppStore, type Topic, type DataPackage } from "../store/useAppStore";
import { useState } from "react";
import { TopicDrawer } from "../features/sources/TopicDrawer";
import { TopicRevisionDrawer } from "../features/sources/TopicRevisionDrawer";
import { api } from "../utils/api";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";

export function TopicsPage() {
  const topics = useAppStore((s) => s.topics);
  const removeTopic = useAppStore((s) => s.removeTopic);
  const fetchAll = useAppStore((s) => s.fetchAll);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [drawerOpen, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);
  const [revisionDrawerOpen, { open: openRevisionDrawer, close: closeRevisionDrawer }] =
    useDisclosure(false);
  const [selectedTopicForRevision, setSelectedTopicForRevision] = useState<Topic | null>(null);
  const [revisionPackages, setRevisionPackages] = useState<Record<string, DataPackage[]>>({});
  const [revisionPackagesPage, setRevisionPackagesPage] = useState<Record<string, number>>({});
  const [loadingPackages, setLoadingPackages] = useState<Record<string, boolean>>({});

  const packagesPerPage = 10;

  const handleCreateRevision = (topic: Topic) => {
    setSelectedTopicForRevision(topic);
    openRevisionDrawer();
  };

  const loadPackagesForRevision = async (revisionId: string, page: number = 1) => {
    setLoadingPackages((prev) => ({ ...prev, [revisionId]: true }));
    try {
      const response = await api.packages.list({ topic_revision: revisionId });
      const packages = response as DataPackage[];
      setRevisionPackages((prev) => ({ ...prev, [revisionId]: packages }));
      setRevisionPackagesPage((prev) => ({ ...prev, [revisionId]: page }));
    } catch (error) {
      console.error("Failed to load packages:", error);
    } finally {
      setLoadingPackages((prev) => ({ ...prev, [revisionId]: false }));
    }
  };

  const getPackagesForRevision = (revisionId: string, page: number) => {
    const packages = revisionPackages[revisionId] || [];
    const start = (page - 1) * packagesPerPage;
    const end = start + packagesPerPage;
    return packages.slice(start, end);
  };

  const getTotalPagesForRevision = (revisionId: string) => {
    const packages = revisionPackages[revisionId] || [];
    return Math.ceil(packages.length / packagesPerPage);
  };

  const handleDeleteTopic = (topic: Topic) => {
    modals.openConfirmModal({
      title: "Delete Topic",
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{topic.name}</strong>? This will delete all revisions and associated data packages. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await removeTopic(String(topic.id));
          notifications.show({
            message: "Topic deleted successfully",
            color: "teal",
          });
        } catch (error: any) {
          notifications.show({
            message: error?.message || "Failed to delete topic",
            color: "red",
          });
        }
      },
    });
  };

  const handleDeleteRevision = async (revisionId: string, revisionNumber: number) => {
    modals.openConfirmModal({
      title: "Delete Topic Revision",
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>Revision {revisionNumber}</strong>? This will delete all data packages associated with this revision. This action cannot be undone.
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
          // Refresh the topics to update the UI
          await fetchAll();
        } catch (error: any) {
          notifications.show({
            message: error?.message || "Failed to delete revision",
            color: "red",
          });
        }
      },
    });
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Topics</Title>
          <Text c="dimmed">
            Collections of data packages with defined schemas. Each topic can
            have multiple revisions.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openDrawer}>
          Create Topic
        </Button>
      </Group>

      <Card withBorder>
        {topics.length === 0 ? (
          <Text c="dimmed">
            No topics yet. Create a topic to organize data packages with a
            defined schema.
          </Text>
        ) : (
          <Accordion value={selectedTopic} onChange={setSelectedTopic}>
            {topics.map((topic) => (
              <Accordion.Item key={topic.id} value={String(topic.id)}>
                <Accordion.Control>
                  <Group justify="space-between">
                    <div>
                      <Text fw={500}>{topic.name}</Text>
                      {topic.description && (
                        <Text size="sm" c="dimmed">
                          {topic.description}
                        </Text>
                      )}
                    </div>
                    <Group>
                      <Badge variant="light">
                        {topic.revisions?.length || 0} revision
                        {topic.revisions?.length !== 1 ? "s" : ""}
                      </Badge>
                      <Badge variant="light" color="blue">
                        {topic.total_packages || 0} package
                        {topic.total_packages !== 1 ? "s" : ""}
                      </Badge>
                      <Tooltip label="Delete topic">
                        <ActionIcon
                          color="red"
                          variant="light"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTopic(topic);
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Group justify="flex-end">
                      <Button
                        size="xs"
                        leftSection={<IconPlus size={14} />}
                        onClick={() => handleCreateRevision(topic)}
                      >
                        Create New Revision
                      </Button>
                    </Group>

                    {topic.revisions && topic.revisions.length > 0 ? (
                      <Accordion variant="contained">
                        {topic.revisions.map((revision) => {
                          const revisionId = String(revision.id);
                          const currentPage = revisionPackagesPage[revisionId] || 1;
                          const packages = getPackagesForRevision(revisionId, currentPage);
                          const totalPages = getTotalPagesForRevision(revisionId);
                          const isLoading = loadingPackages[revisionId];

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
                                          handleDeleteRevision(revisionId, revision.revision_number);
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
                                          {revision.schema
                                            .sort(
                                              (a: any, b: any) =>
                                                a.position - b.position
                                            )
                                            .map((col: any) => (
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
                                    {isLoading ? (
                                      <Center p="xl">
                                        <Loader size="sm" />
                                      </Center>
                                    ) : packages.length > 0 ? (
                                      <>
                                        <Table highlightOnHover>
                                          <Table.Thead>
                                            <Table.Tr>
                                              <Table.Th>Name</Table.Th>
                                              <Table.Th>Status</Table.Th>
                                              <Table.Th>File Size</Table.Th>
                                              <Table.Th>Created</Table.Th>
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
                                                    {new Date(pkg.created_at).toLocaleDateString()}
                                                  </Text>
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
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Card>

      <TopicDrawer opened={drawerOpen} onClose={closeDrawer} />
      <TopicRevisionDrawer
        opened={revisionDrawerOpen}
        onClose={closeRevisionDrawer}
        topic={selectedTopicForRevision}
      />
    </Stack>
  );
}
