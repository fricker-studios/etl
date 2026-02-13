import {
  Stack,
  Card,
  Text,
  Badge,
  Group,
  Breadcrumbs,
  Anchor,
  Divider,
  ActionIcon,
  Tooltip,
  Box,
  useMantineColorScheme,
  Title,
  Select,
  Alert,
  SimpleGrid,
  Loader,
  Button,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconHash,
  IconTable,
  IconDatabase,
  IconColumns,
  IconCalendar,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useModel, useDeleteModel } from "../hooks/useModels";
import { PageHeader } from "../components/common/PageHeader";
import { modals } from "@mantine/modals";
import { useDisclosure } from "@mantine/hooks";
import { useTopics } from "../hooks/useTopics";
import { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../utils/api";

export function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(id ?? null);
  const deleteModel = useDeleteModel();
  const { data: topics = [] } = useTopics();
  const [editModalOpen, { open: openEditModal }] = useDisclosure(false);
  const { colorScheme } = useMantineColorScheme();

  // Fetch ClickHouse status
  const { data: clickhouseStatus } = useQuery<any>({
    queryKey: ["clickhouse-status"],
    queryFn: () => api.models.clickhouseStatus(),
  });

  // Fetch table statistics
  const { data: tableStats, isLoading: tableStatsLoading } = useQuery<any>({
    queryKey: ["table-stats", id],
    queryFn: () => api.models.tableStats(id!),
    enabled: !!id && clickhouseStatus?.configured === true,
  });

  // Refs for DAG visualization
  const topicFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const modelFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hashInputRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hashOutputRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [connectionLines, setConnectionLines] = useState<
    Array<{
      path: string;
      color: string;
    }>
  >([]);

  // Extract field mappings for DAG visualization (must be done before conditional returns)
  const entityDetails: any =
    model?.type === "data_vault"
      ? model.hubs?.[0] || model.links?.[0] || model.satellites?.[0]
      : model?.facts?.[0] || model?.dimensions?.[0];
  const fieldMappings = entityDetails?.field_mappings || [];
  const hasFieldMappings = fieldMappings.length > 0;

  // Calculate connection lines for DAG - must be called before any conditional returns
  useEffect(() => {
    if (!hasFieldMappings || !entityDetails) return;

    const calculateLines = () => {
      const lines: Array<{ path: string; color: string }> = [];
      const cornerRadius = 10;

      // Helper to create curved path
      const createCurvedPath = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
      ): string => {
        const midX = (x1 + x2) / 2;
        let path = `M ${x1} ${y1}`;
        path += ` L ${midX - cornerRadius} ${y1}`;
        if (y2 > y1) {
          path += ` Q ${midX} ${y1} ${midX} ${y1 + cornerRadius}`;
          path += ` L ${midX} ${y2 - cornerRadius}`;
          path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
        } else {
          path += ` Q ${midX} ${y1} ${midX} ${y1 - cornerRadius}`;
          path += ` L ${midX} ${y2 + cornerRadius}`;
          path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
        }
        path += ` L ${x2} ${y2}`;
        return path;
      };

      fieldMappings.forEach((mapping: any) => {
        const hasTransformation =
          mapping.transformation && mapping.transformation.startsWith("hash_");

        if (hasTransformation) {
          // Hash transformation: topic -> hash -> model
          const topicFieldKey = `${mapping.topic_id}-${mapping.topic_field}`;
          const hashKey = `${mapping.topic_id}-${mapping.topic_field}-${mapping.model_field}`;
          const modelFieldKey = mapping.model_field;

          const topicFieldEl = topicFieldRefs.current[topicFieldKey];
          const hashInputEl = hashInputRefs.current[hashKey];
          const hashOutputEl = hashOutputRefs.current[hashKey];
          const modelFieldEl = modelFieldRefs.current[modelFieldKey];

          const container = topicFieldEl?.closest(".dag-container");
          const containerRect = container?.getBoundingClientRect();

          // Topic -> Hash (blue line)
          if (topicFieldEl && hashInputEl && containerRect) {
            const topicRect = topicFieldEl.getBoundingClientRect();
            const hashInputRect = hashInputEl.getBoundingClientRect();
            const path = createCurvedPath(
              topicRect.right - containerRect.left,
              topicRect.top + topicRect.height / 2 - containerRect.top,
              hashInputRect.left - containerRect.left,
              hashInputRect.top + hashInputRect.height / 2 - containerRect.top,
            );
            lines.push({ path, color: "#4dabf7" });
          }

          // Hash -> Model (green line)
          if (hashOutputEl && modelFieldEl && containerRect) {
            const hashOutputRect = hashOutputEl.getBoundingClientRect();
            const modelRect = modelFieldEl.getBoundingClientRect();
            const path = createCurvedPath(
              hashOutputRect.right - containerRect.left,
              hashOutputRect.top +
                hashOutputRect.height / 2 -
                containerRect.top,
              modelRect.left - containerRect.left,
              modelRect.top + modelRect.height / 2 - containerRect.top,
            );
            lines.push({ path, color: "#51cf66" });
          }
        } else {
          // Direct mapping: topic -> model (blue line)
          const topicFieldKey = `${mapping.topic_id}-${mapping.topic_field}`;
          const modelFieldKey = mapping.model_field;

          const topicFieldEl = topicFieldRefs.current[topicFieldKey];
          const modelFieldEl = modelFieldRefs.current[modelFieldKey];

          if (topicFieldEl && modelFieldEl) {
            const topicRect = topicFieldEl.getBoundingClientRect();
            const modelRect = modelFieldEl.getBoundingClientRect();
            const container = topicFieldEl.closest(".dag-container");
            const containerRect = container?.getBoundingClientRect();

            if (containerRect) {
              const path = createCurvedPath(
                topicRect.right - containerRect.left,
                topicRect.top + topicRect.height / 2 - containerRect.top,
                modelRect.left - containerRect.left,
                modelRect.top + modelRect.height / 2 - containerRect.top,
              );
              lines.push({ path, color: "#4dabf7" });
            }
          }
        }
      });

      setConnectionLines(lines);
    };

    calculateLines();
    window.addEventListener("resize", calculateLines);
    return () => window.removeEventListener("resize", calculateLines);
  }, [fieldMappings, hasFieldMappings]);

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Delete Model",
      children: (
        <Text size="sm">
          Are you sure you want to delete this model? This action cannot be
          undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        if (id) {
          await deleteModel.mutateAsync(id);
          navigate("/models");
        }
      },
    });
  };

  if (isLoading) {
    return (
      <Stack>
        <PageHeader title="Loading..." description="Loading model details..." />
        <Card withBorder>
          <Text c="dimmed">Loading...</Text>
        </Card>
      </Stack>
    );
  }

  if (!model) {
    return (
      <Stack>
        <PageHeader title="Not Found" description="Model not found" />
        <Card withBorder>
          <Text c="dimmed">Model not found</Text>
        </Card>
      </Stack>
    );
  }

  // Determine entity type and details
  let entityType = "";
  let entityName = "";

  if (model.type === "data_vault") {
    if (model.hubs && model.hubs.length > 0) {
      entityType = "Hub";
      entityName = model.hubs[0].name;
    } else if (model.links && model.links.length > 0) {
      entityType = "Link";
      entityName = model.links[0].name;
    } else if (model.satellites && model.satellites.length > 0) {
      entityType = "Satellite";
      entityName = model.satellites[0].name;
    }
  } else {
    if (model.facts && model.facts.length > 0) {
      entityType = "Fact";
      entityName = model.facts[0].name;
    } else if (model.dimensions && model.dimensions.length > 0) {
      entityType = "Dimension";
      entityName = model.dimensions[0].name;
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs">
          <Breadcrumbs>
            <Anchor component={Link} to="/models">
              Models
            </Anchor>
            <Text>{model.name}</Text>
          </Breadcrumbs>
          <Group>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => navigate("/models")}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Text size="xl" fw={700}>
              {model.name}
            </Text>
          </Group>
        </Stack>
        <Group>
          <Tooltip label="Edit Model">
            <ActionIcon
              variant="light"
              color="blue"
              size="lg"
              onClick={openEditModal}
            >
              <IconEdit size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete Model">
            <ActionIcon
              variant="light"
              color="red"
              size="lg"
              onClick={handleDelete}
            >
              <IconTrash size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Card withBorder>
        <Stack gap="lg">
          {/* Model Information */}
          <Group grow>
            <div>
              <Text size="sm" c="dimmed" mb={4}>
                Model Type
              </Text>
              <Badge variant="light" size="lg">
                {model.type === "data_vault" ? "Data Vault" : "Dimensional"}
              </Badge>
            </div>

            <div>
              <Text size="sm" c="dimmed" mb={4}>
                Entity Type
              </Text>
              <Badge variant="outline" size="lg">
                {entityType}
              </Badge>
            </div>

            <div>
              <Text size="sm" c="dimmed" mb={4}>
                Entity Name
              </Text>
              <Text fw={500}>{entityName}</Text>
            </div>
          </Group>

          <Divider />

          {/* External Table Information */}
          {(() => {
            // Check if ClickHouse backend is configured
            if (clickhouseStatus?.configured === false) {
              return (
                <Alert
                  variant="light"
                  color="yellow"
                  title="ClickHouse Not Configured"
                  icon={<IconDatabase size={20} />}
                >
                  <Text size="sm" mb="sm">
                    Configure a ClickHouse data warehouse connection to see
                    table statistics.
                  </Text>
                  <Button
                    component={Link}
                    to="/settings"
                    size="xs"
                    variant="light"
                    leftSection={<IconSettings size={16} />}
                  >
                    Go to Settings
                  </Button>
                </Alert>
              );
            }

            // Show loading state
            if (tableStatsLoading) {
              return (
                <Group justify="center" p="md">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Loading table statistics...
                  </Text>
                </Group>
              );
            }

            // Show error or not created state
            if (!tableStats || tableStats.exists === false) {
              const status = tableStats?.status || "not_created";

              return (
                <Alert
                  variant="light"
                  color={status === "error" ? "red" : "gray"}
                  title={
                    status === "error" ? "Table Error" : "Table Not Created"
                  }
                >
                  <Text size="sm">
                    {tableStats?.message ||
                      `Table ${tableStats?.table_name || "for this model"} does not exist yet.`}
                  </Text>
                  {tableStats?.table_name && (
                    <Text size="xs" ff="monospace" c="dimmed" mt="xs">
                      {tableStats.table_name}
                    </Text>
                  )}
                </Alert>
              );
            }

            // Show table statistics
            const statusColors = {
              created: "green",
              updating: "blue",
              not_created: "gray",
              error: "red",
            };

            const statusLabels = {
              created: "Created",
              updating: "Updating",
              not_created: "Not Created",
              error: "Error",
            };

            const lastSyncTime = tableStats.last_updated
              ? Math.floor(
                  (Date.now() - new Date(tableStats.last_updated).getTime()) /
                    60000,
                )
              : null;

            return (
              <>
                <div>
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" c="dimmed" fw={600}>
                      External Table
                    </Text>
                    <Badge
                      color={
                        statusColors[
                          tableStats.status as keyof typeof statusColors
                        ]
                      }
                      size="sm"
                    >
                      {
                        statusLabels[
                          tableStats.status as keyof typeof statusLabels
                        ]
                      }
                    </Badge>
                  </Group>
                  <Text size="sm" ff="monospace" c="dimmed">
                    {tableStats.table_name}
                  </Text>
                </div>

                <SimpleGrid cols={3} spacing="md">
                  {/* Row Count */}
                  <div>
                    <Group gap={6} mb={4}>
                      <IconTable size={16} style={{ color: "#228be6" }} />
                      <Text size="xs" c="dimmed" fw={600}>
                        Rows
                      </Text>
                    </Group>
                    <Text size="lg" fw={700}>
                      {tableStats.row_count?.toLocaleString() || "0"}
                    </Text>
                  </div>

                  {/* Table Size */}
                  <div>
                    <Group gap={6} mb={4}>
                      <IconDatabase size={16} style={{ color: "#228be6" }} />
                      <Text size="xs" c="dimmed" fw={600}>
                        Size
                      </Text>
                    </Group>
                    <Text size="lg" fw={700}>
                      {tableStats.size_mb} MB
                    </Text>
                  </div>

                  {/* Column Count */}
                  <div>
                    <Group gap={6} mb={4}>
                      <IconColumns size={16} style={{ color: "#228be6" }} />
                      <Text size="xs" c="dimmed" fw={600}>
                        Columns
                      </Text>
                    </Group>
                    <Text size="lg" fw={700}>
                      {tableStats.column_count}
                    </Text>
                  </div>

                  {/* Last Updated */}
                  <div>
                    <Group gap={6} mb={4}>
                      <IconCalendar size={16} style={{ color: "#228be6" }} />
                      <Text size="xs" c="dimmed" fw={600}>
                        Last Updated
                      </Text>
                    </Group>
                    <Text size="sm" fw={600}>
                      {tableStats.last_updated
                        ? new Date(tableStats.last_updated).toLocaleString()
                        : "N/A"}
                    </Text>
                  </div>

                  {/* Last Sync */}
                  {lastSyncTime !== null && (
                    <div>
                      <Group gap={6} mb={4}>
                        <IconRefresh size={16} style={{ color: "#228be6" }} />
                        <Text size="xs" c="dimmed" fw={600}>
                          Last Sync
                        </Text>
                      </Group>
                      <Text size="sm" fw={600}>
                        {lastSyncTime < 1
                          ? "Just now"
                          : `${lastSyncTime} min ago`}
                      </Text>
                    </div>
                  )}
                </SimpleGrid>
              </>
            );
          })()}
        </Stack>
      </Card>

      <Card withBorder>
        <Text size="lg" fw={600} mb="md">
          Field Mappings
        </Text>
        <Divider mb="md" />

        <Box
          className="dag-container"
          style={{
            position: "relative",
            minHeight: "400px",
            display: "flex",
            justifyContent: "space-between",
            gap: "40px",
            padding: "20px",
          }}
        >
          {/* SVG for connection lines */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <defs>
              <marker
                id="arrowhead-blue"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3, 0 6"
                  fill={colorScheme === "dark" ? "#4dabf7" : "#1c7ed6"}
                />
              </marker>
              <marker
                id="arrowhead-green"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3, 0 6"
                  fill={colorScheme === "dark" ? "#51cf66" : "#2f9e44"}
                />
              </marker>
            </defs>
            {connectionLines.map((line, idx) => (
              <path
                key={idx}
                d={line.path}
                stroke={line.color}
                strokeWidth="2"
                fill="none"
                markerEnd={
                  line.color === "#51cf66"
                    ? "url(#arrowhead-green)"
                    : "url(#arrowhead-blue)"
                }
              />
            ))}
          </svg>

          {/* Left side: Topic Fields */}
          <Box style={{ flex: "0 0 30%", zIndex: 2 }}>
            <Stack gap="md">
              <Title order={5}>Source Topics</Title>
              {(() => {
                // Group mappings by topic
                const topicGroups: Record<string, any[]> = {};
                fieldMappings.forEach((m: any) => {
                  if (!topicGroups[m.topic_id]) {
                    topicGroups[m.topic_id] = [];
                  }
                  topicGroups[m.topic_id].push(m);
                });

                return Object.entries(topicGroups).map(
                  ([topicId, mappings]) => {
                    const topicData = topics.find(
                      (t: any) => String(t.id) === String(topicId),
                    );
                    const topicName = topicData?.name || "Unknown Topic";

                    return (
                      <Card key={topicId} withBorder shadow="sm" p="md">
                        <Stack gap="sm">
                          <Badge variant="dot" size="sm">
                            {topicName}
                          </Badge>
                          <Divider />
                          <Stack gap="xs">
                            {mappings.map((mapping: any) => {
                              const fieldKey = `${mapping.topic_id}-${mapping.topic_field}`;
                              return (
                                <Box
                                  key={fieldKey}
                                  ref={(el) => {
                                    topicFieldRefs.current[fieldKey] = el;
                                  }}
                                  p="xs"
                                  style={{
                                    borderRadius: "4px",
                                    border: `1px solid ${colorScheme === "dark" ? "#373A40" : "#dee2e6"}`,
                                    backgroundColor:
                                      colorScheme === "dark"
                                        ? "#25262b"
                                        : "#f8f9fa",
                                  }}
                                >
                                  <Text size="sm" fw={500}>
                                    {mapping.topic_field}
                                  </Text>
                                </Box>
                              );
                            })}
                          </Stack>
                        </Stack>
                      </Card>
                    );
                  },
                );
              })()}
            </Stack>
          </Box>

          {/* Middle: Hash Components */}
          <Box style={{ flex: "0 0 30%", zIndex: 2 }}>
            <Stack gap="md">
              <Title order={5}>Transformations</Title>
              {(() => {
                // Find all hash transformations
                const hashTransformations = fieldMappings.filter(
                  (m: any) =>
                    m.transformation && m.transformation.startsWith("hash_"),
                );

                if (hashTransformations.length === 0) {
                  return (
                    <Text c="dimmed" size="sm" ta="center" py="xl">
                      No transformations
                    </Text>
                  );
                }

                return hashTransformations.map((mapping: any) => {
                  const hashKey = `${mapping.topic_id}-${mapping.topic_field}-${mapping.model_field}`;
                  const hashMethod = mapping.transformation.replace(
                    "hash_",
                    "",
                  );

                  return (
                    <Box
                      key={hashKey}
                      style={{
                        width: "200px",
                        margin: "0 auto",
                      }}
                    >
                      <Card
                        withBorder
                        shadow="md"
                        p="xs"
                        style={{
                          position: "relative",
                        }}
                      >
                        {/* Input Connection Node (Left) - Blue */}
                        <Box
                          ref={(el) => {
                            hashInputRefs.current[hashKey] = el;
                          }}
                          style={{
                            position: "absolute",
                            left: -8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background:
                              colorScheme === "dark" ? "#4dabf7" : "#1c7ed6",
                            border: "2px solid white",
                            zIndex: 10,
                          }}
                          title="Input connection point"
                        />

                        {/* Output Connection Node (Right) - Green */}
                        <Box
                          ref={(el) => {
                            hashOutputRefs.current[hashKey] = el;
                          }}
                          style={{
                            position: "absolute",
                            right: -8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background:
                              colorScheme === "dark" ? "#51cf66" : "#2f9e44",
                            border: "2px solid white",
                            zIndex: 10,
                          }}
                          title="Output connection point"
                        />

                        <Group justify="space-between" mb="xs">
                          <Group gap="xs">
                            <IconHash size={16} />
                            <Text fw={600} size="sm">
                              Hash
                            </Text>
                          </Group>
                        </Group>

                        <Select
                          size="xs"
                          value={hashMethod}
                          disabled
                          data={[
                            { value: "MD5", label: "MD5" },
                            { value: "SHA-1", label: "SHA-1" },
                            { value: "SHA-256", label: "SHA-256" },
                          ]}
                          styles={{
                            input: {
                              minHeight: "28px",
                            },
                          }}
                        />
                      </Card>
                    </Box>
                  );
                });
              })()}
            </Stack>
          </Box>

          {/* Right side: Model Fields */}
          <Box style={{ flex: "0 0 30%", zIndex: 2 }}>
            <Stack gap="md">
              <Title order={5}>Model Fields</Title>
              <Card withBorder shadow="sm" p="md">
                <Stack gap="sm">
                  <Badge variant="outline" size="sm">
                    {entityType}
                  </Badge>
                  <Divider />
                  {entityDetails.fields && entityDetails.fields.length > 0 ? (
                    <Stack gap="xs">
                      {entityDetails.fields.map((field: string) => {
                        const mappingsForField = fieldMappings.filter(
                          (m: any) => m.model_field === field,
                        );
                        const isMapped = mappingsForField.length > 0;
                        return (
                          <Box
                            key={field}
                            ref={(el) => {
                              modelFieldRefs.current[field] = el;
                            }}
                            p="xs"
                            style={{
                              borderRadius: "4px",
                              border: `1px solid ${isMapped ? (colorScheme === "dark" ? "#1864ab" : "#4dabf7") : colorScheme === "dark" ? "#373A40" : "#dee2e6"}`,
                              backgroundColor: isMapped
                                ? colorScheme === "dark"
                                  ? "#1971c2"
                                  : "#e7f5ff"
                                : colorScheme === "dark"
                                  ? "#25262b"
                                  : "#f8f9fa",
                            }}
                          >
                            <Text size="sm" fw={500}>
                              {field}
                            </Text>
                            {mappingsForField.length > 0 && (
                              <Group gap={4} mt={4}>
                                {mappingsForField.map((m: any, idx: number) => {
                                  const hasTransformation =
                                    m.transformation &&
                                    m.transformation.startsWith("hash_");
                                  const transformationType = hasTransformation
                                    ? m.transformation.replace("hash_", "")
                                    : null;

                                  return (
                                    <Badge
                                      key={idx}
                                      size="xs"
                                      variant="light"
                                      color={
                                        hasTransformation ? "green" : "blue"
                                      }
                                    >
                                      ← {m.topic_field}
                                      {hasTransformation &&
                                        ` [${transformationType}]`}
                                    </Badge>
                                  );
                                })}
                              </Group>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm" ta="center" py="md">
                      No model fields defined
                    </Text>
                  )}
                </Stack>
              </Card>
            </Stack>
          </Box>
        </Box>

        {/* Show message if no mappings available */}
        {!hasFieldMappings && (
          <Text c="dimmed" ta="center" mt="md" size="sm">
            No field mappings available. Create mappings in the Data Model
            Canvas.
          </Text>
        )}
      </Card>

      {/* Edit Modal - Note: This is a placeholder. Full edit functionality would require enhancing ModelWizard */}
      {editModalOpen && (
        <Text c="dimmed" ta="center" mt="xl">
          Edit functionality coming soon. Please delete and recreate the model
          for now.
        </Text>
      )}
    </Stack>
  );
}
