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
} from "@mantine/core";
import { IconArrowLeft, IconEdit, IconTrash } from "@tabler/icons-react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useModel, useDeleteModel } from "../hooks/useModels";
import { PageHeader } from "../components/common/PageHeader";
import { modals } from "@mantine/modals";
import { useDisclosure } from "@mantine/hooks";
import { useTopics } from "../hooks/useTopics";
import { useRef, useEffect, useState } from "react";

export function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(id ?? null);
  const deleteModel = useDeleteModel();
  const { data: topics = [] } = useTopics();
  const [editModalOpen, { open: openEditModal }] = useDisclosure(false);
  const { colorScheme } = useMantineColorScheme();
  
  // Refs for DAG visualization
  const topicFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const modelFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [connectionLines, setConnectionLines] = useState<Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>>([]);

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
  let entityDetails: any = null;

  if (model.type === "data_vault") {
    if (model.hubs && model.hubs.length > 0) {
      entityType = "Hub";
      entityName = model.hubs[0].name;
      entityDetails = model.hubs[0];
    } else if (model.links && model.links.length > 0) {
      entityType = "Link";
      entityName = model.links[0].name;
      entityDetails = model.links[0];
    } else if (model.satellites && model.satellites.length > 0) {
      entityType = "Satellite";
      entityName = model.satellites[0].name;
      entityDetails = model.satellites[0];
    }
  } else {
    if (model.facts && model.facts.length > 0) {
      entityType = "Fact";
      entityName = model.facts[0].name;
      entityDetails = model.facts[0];
    } else if (model.dimensions && model.dimensions.length > 0) {
      entityType = "Dimension";
      entityName = model.dimensions[0].name;
      entityDetails = model.dimensions[0];
    }
  }

  const topic = topics.find((t: any) => String(t.id) === entityDetails?.topic);

  // Extract field mappings for DAG visualization
  const fieldMappings = entityDetails?.field_mappings || [];
  const hasFieldMappings = fieldMappings.length > 0;

  // Calculate connection lines for DAG
  useEffect(() => {
    if (!hasFieldMappings) return;

    const calculateLines = () => {
      const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      
      fieldMappings.forEach((mapping: any) => {
        const topicFieldKey = `${mapping.topic_id}-${mapping.topic_field}`;
        const modelFieldKey = mapping.model_field;
        
        const topicFieldEl = topicFieldRefs.current[topicFieldKey];
        const modelFieldEl = modelFieldRefs.current[modelFieldKey];
        
        if (topicFieldEl && modelFieldEl) {
          const topicRect = topicFieldEl.getBoundingClientRect();
          const modelRect = modelFieldEl.getBoundingClientRect();
          const container = topicFieldEl.closest('.dag-container');
          const containerRect = container?.getBoundingClientRect();
          
          if (containerRect) {
            lines.push({
              x1: topicRect.right - containerRect.left,
              y1: topicRect.top + topicRect.height / 2 - containerRect.top,
              x2: modelRect.left - containerRect.left,
              y2: modelRect.top + modelRect.height / 2 - containerRect.top,
            });
          }
        }
      });
      
      setConnectionLines(lines);
    };

    calculateLines();
    window.addEventListener('resize', calculateLines);
    return () => window.removeEventListener('resize', calculateLines);
  }, [fieldMappings, hasFieldMappings]);

  // Get topic schema for displaying fields
  const topicSchema = topic?.current_revision?.schema || [];

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
        <Stack gap="md">
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

          {topic && (
            <div>
              <Text size="sm" c="dimmed" mb={4}>
                Source Topic
              </Text>
              <Badge variant="dot" size="lg">
                {topic.name}
              </Badge>
            </div>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Text size="lg" fw={600} mb="md">
          Field Mappings
        </Text>
        <Divider mb="md" />

        {hasFieldMappings ? (
          <Box
            className="dag-container"
            style={{
              position: "relative",
              minHeight: "400px",
              display: "flex",
              justifyContent: "space-between",
              gap: "60px",
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
                  id="arrowhead-detail"
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
              </defs>
              {connectionLines.map((line, idx) => (
                <line
                  key={idx}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={colorScheme === "dark" ? "#4dabf7" : "#1c7ed6"}
                  strokeWidth="2"
                  markerEnd="url(#arrowhead-detail)"
                />
              ))}
            </svg>

            {/* Left side: Topic Fields */}
            <Box style={{ flex: "0 0 40%", zIndex: 2 }}>
              <Card withBorder shadow="sm" p="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      Source Topic
                    </Text>
                    <Badge variant="dot" size="sm">
                      {topic?.name || "Unknown"}
                    </Badge>
                  </Group>
                  <Divider />
                  <Stack gap="xs">
                    {topicSchema.map((field: any) => {
                      const isMapped = fieldMappings.some(
                        (m: any) => m.topic_field === field.name,
                      );
                      const fieldKey = `${entityDetails.topic}-${field.name}`;
                      return (
                        <Box
                          key={field.name}
                          ref={(el) => (topicFieldRefs.current[fieldKey] = el)}
                          p="xs"
                          style={{
                            borderRadius: "4px",
                            border: `1px solid ${isMapped ? (colorScheme === "dark" ? "#2f9e44" : "#37b24d") : (colorScheme === "dark" ? "#373A40" : "#dee2e6")}`,
                            backgroundColor: isMapped
                              ? colorScheme === "dark"
                                ? "#2b8a3e"
                                : "#d3f9d8"
                              : undefined,
                          }}
                        >
                          <Text size="sm" fw={500}>
                            {field.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {field.type}
                          </Text>
                        </Box>
                      );
                    })}
                  </Stack>
                </Stack>
              </Card>
            </Box>

            {/* Right side: Model Fields */}
            <Box style={{ flex: "0 0 40%", zIndex: 2 }}>
              <Card withBorder shadow="sm" p="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      Model Fields
                    </Text>
                    <Badge variant="outline" size="sm">
                      {entityType}
                    </Badge>
                  </Group>
                  <Divider />
                  <Stack gap="xs">
                    {entityDetails.fields?.map((field: string) => {
                      const mappingsForField = fieldMappings.filter(
                        (m: any) => m.model_field === field,
                      );
                      return (
                        <Box
                          key={field}
                          ref={(el) => (modelFieldRefs.current[field] = el)}
                          p="xs"
                          style={{
                            borderRadius: "4px",
                            border: `1px solid ${colorScheme === "dark" ? "#1864ab" : "#4dabf7"}`,
                            backgroundColor:
                              colorScheme === "dark" ? "#1971c2" : "#e7f5ff",
                          }}
                        >
                          <Text size="sm" fw={500}>
                            {field}
                          </Text>
                          {mappingsForField.length > 0 && (
                            <Group gap={4} mt={4}>
                              {mappingsForField.map((m: any, idx: number) => {
                                const sourceTopic = topics.find(
                                  (t: any) => String(t.id) === String(m.topic_id),
                                );
                                return (
                                  <Badge
                                    key={idx}
                                    size="xs"
                                    variant="light"
                                    color="blue"
                                  >
                                    ← {m.topic_field}
                                    {sourceTopic && ` (${sourceTopic.name})`}
                                  </Badge>
                                );
                              })}
                            </Group>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Stack>
              </Card>
            </Box>
          </Box>
        ) : (
          // Fallback: Show badge-based view if no field_mappings
          <Stack gap="md">
            {entityDetails && (
              <>
                {entityType === "Hub" && (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Business Key
                      </Text>
                      <Badge variant="filled">{entityDetails.business_key}</Badge>
                    </div>
                    {entityDetails.fields && entityDetails.fields.length > 0 && (
                      <div>
                        <Text size="sm" c="dimmed" mb={4}>
                          Additional Attributes ({entityDetails.fields.length})
                        </Text>
                        <Group gap="xs">
                          {entityDetails.fields.map(
                            (field: string, idx: number) => (
                              <Badge key={idx} variant="light">
                                {field}
                              </Badge>
                            ),
                          )}
                        </Group>
                      </div>
                    )}
                  </>
                )}

                {entityType === "Link" && (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Hub References ({entityDetails.hub_references?.length || 0})
                      </Text>
                      <Group gap="xs">
                        {(entityDetails.hub_references || []).map(
                          (hub: string, idx: number) => (
                            <Badge key={idx} variant="filled">
                              {hub}
                            </Badge>
                          ),
                        )}
                      </Group>
                    </div>
                    {entityDetails.fields && entityDetails.fields.length > 0 && (
                      <div>
                        <Text size="sm" c="dimmed" mb={4}>
                          Link Fields ({entityDetails.fields.length})
                        </Text>
                        <Group gap="xs">
                          {entityDetails.fields.map(
                            (field: string, idx: number) => (
                              <Badge key={idx} variant="light">
                                {field}
                              </Badge>
                            ),
                          )}
                        </Group>
                      </div>
                    )}
                  </>
                )}

                {entityType === "Satellite" && (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Parent Hub
                      </Text>
                      <Badge variant="filled">{entityDetails.parent}</Badge>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Attribute Fields ({entityDetails.fields?.length || 0})
                      </Text>
                      <Group gap="xs">
                        {(entityDetails.fields || []).map(
                          (field: string, idx: number) => (
                            <Badge key={idx} variant="light">
                              {field}
                            </Badge>
                          ),
                        )}
                      </Group>
                    </div>
                  </>
                )}

                {entityType === "Fact" && (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Grain
                      </Text>
                      <Text fw={500}>{entityDetails.grain}</Text>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Measures ({entityDetails.measures?.length || 0})
                      </Text>
                      <Group gap="xs">
                        {(entityDetails.measures || []).map(
                          (measure: string, idx: number) => (
                            <Badge key={idx} variant="filled" color="blue">
                              {measure}
                            </Badge>
                          ),
                        )}
                      </Group>
                    </div>
                    {entityDetails.dimension_keys &&
                      entityDetails.dimension_keys.length > 0 && (
                        <div>
                          <Text size="sm" c="dimmed" mb={4}>
                            Dimension Keys ({entityDetails.dimension_keys.length})
                          </Text>
                          <Group gap="xs">
                            {entityDetails.dimension_keys.map(
                              (key: string, idx: number) => (
                                <Badge key={idx} variant="light">
                                  {key}
                                </Badge>
                              ),
                            )}
                          </Group>
                        </div>
                      )}
                  </>
                )}

                {entityType === "Dimension" && (
                  <>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Primary Key
                      </Text>
                      <Badge variant="filled">{entityDetails.key}</Badge>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed" mb={4}>
                        Attribute Fields ({entityDetails.fields?.length || 0})
                      </Text>
                      <Group gap="xs">
                        {(entityDetails.fields || []).map(
                          (field: string, idx: number) => (
                            <Badge key={idx} variant="light">
                              {field}
                            </Badge>
                          ),
                        )}
                      </Group>
                    </div>
                  </>
                )}
              </>
            )}
          </Stack>
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
