import {
  Stack,
  Card,
  Text,
  Button,
  Group,
  Badge,
  ActionIcon,
  Collapse,
  Box,
  Paper,
  Modal,
  TextInput,
  Select,
  Menu,
  Divider,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconPlus,
  IconChevronDown,
  IconChevronRight,
  IconArrowLeft,
  IconDeviceFloppy,
  IconX,
  IconGripVertical,
  IconEdit,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDisclosure } from "@mantine/hooks";
import { useTopics } from "../hooks/useTopics";
import { useCreateModel } from "../hooks/useModels";
import { notifications } from "@mantine/notifications";

type EntityType = "hub" | "link" | "satellite" | "fact" | "dimension";

interface FieldMapping {
  topicId: string;
  topicField: string; // column name
  modelField: string; // target field name in model
}

export function ModelCanvasPage() {
  const navigate = useNavigate();
  const { data: topics = [] } = useTopics();
  const createModel = useCreateModel();
  const { colorScheme } = useMantineColorScheme();

  // Setup modal state
  const [setupModalOpen, { close: closeSetup }] = useDisclosure(true);
  const [modelName, setModelName] = useState("");
  const [modelType, setModelType] = useState<"data_vault" | "dimensional">(
    "data_vault",
  );
  const [entityType, setEntityType] = useState<EntityType>("hub");
  const [entityName, setEntityName] = useState("");

  // Canvas state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(
    {},
  );
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [modelFields, setModelFields] = useState<string[]>([]); // Fields in the model
  const [draggedColumn, setDraggedColumn] = useState<{
    topicId: string;
    columnName: string;
  } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const topicColRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const modelFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-generate entity name when model name changes
  useEffect(() => {
    if (modelName && !entityName) {
      const prefix =
        entityType === "hub"
          ? "Hub"
          : entityType === "link"
            ? "Link"
            : entityType === "satellite"
              ? "Sat"
              : entityType === "fact"
                ? "Fact"
                : "Dim";
      const cleanName = modelName.replace(/[^a-zA-Z0-9]/g, "");
      setEntityName(`${prefix}_${cleanName}`);
    }
  }, [modelName, entityType, entityName]);

  const handleSetupComplete = () => {
    if (!modelName.trim()) {
      notifications.show({
        message: "Please enter a model name",
        color: "red",
      });
      return;
    }
    
    // Auto-create required fields based on entity type
    const requiredFields: string[] = [];
    if (entityType === "hub") {
      requiredFields.push("business_key");
    } else if (entityType === "link") {
      requiredFields.push("link_key");
    } else if (entityType === "satellite") {
      requiredFields.push("parent_key", "load_date");
    } else if (entityType === "fact") {
      requiredFields.push("grain");
    } else if (entityType === "dimension") {
      requiredFields.push("dimension_key");
    }
    
    setModelFields(requiredFields);
    closeSetup();
  };

  const handleAddTopic = (topicId: string) => {
    if (!selectedTopics.includes(topicId)) {
      setSelectedTopics([...selectedTopics, topicId]);
      setExpandedTopics({ ...expandedTopics, [topicId]: true });
    }
  };

  const handleRemoveTopic = (topicId: string) => {
    setSelectedTopics(selectedTopics.filter((id) => id !== topicId));
    // Remove mappings for this topic
    setFieldMappings(fieldMappings.filter((m) => m.topicId !== topicId));
  };

  const toggleTopicExpanded = (topicId: string) => {
    setExpandedTopics({
      ...expandedTopics,
      [topicId]: !expandedTopics[topicId],
    });
  };

  const handleAddModelField = () => {
    const fieldName = `field_${modelFields.length + 1}`;
    setModelFields([...modelFields, fieldName]);
  };

  const handleRemoveModelField = (fieldName: string) => {
    setModelFields(modelFields.filter((f) => f !== fieldName));
    // Remove any mappings to this field
    setFieldMappings(fieldMappings.filter((m) => m.modelField !== fieldName));
  };

  const handleColumnDragStart = (topicId: string, columnName: string) => {
    setDraggedColumn({ topicId, columnName });
  };

  const handleColumnDragEnd = () => {
    setDraggedColumn(null);
  };

  const handleFieldDrop = (modelField: string) => {
    if (!draggedColumn) return;

    // Check if this mapping already exists
    const existingMapping = fieldMappings.find(
      (m) =>
        m.topicId === draggedColumn.topicId &&
        m.topicField === draggedColumn.columnName &&
        m.modelField === modelField,
    );

    if (existingMapping) {
      notifications.show({
        message: "This mapping already exists",
        color: "orange",
      });
      setDraggedColumn(null);
      return;
    }

    // Add new mapping
    setFieldMappings([
      ...fieldMappings,
      {
        topicId: draggedColumn.topicId,
        topicField: draggedColumn.columnName,
        modelField: modelField,
      },
    ]);

    setDraggedColumn(null);
    notifications.show({
      message: "Mapping created",
      color: "green",
    });
  };

  const handleRemoveMapping = (mapping: FieldMapping) => {
    setFieldMappings(
      fieldMappings.filter(
        (m) =>
          !(
            m.topicId === mapping.topicId &&
            m.topicField === mapping.topicField &&
            m.modelField === mapping.modelField
          ),
      ),
    );
  };

  const handleStartEditField = (fieldName: string) => {
    setEditingField(fieldName);
    setEditingFieldValue(fieldName);
  };

  const handleFinishEditField = () => {
    if (!editingField) return;

    const trimmedValue = editingFieldValue.trim();
    
    // Validate field name
    if (!trimmedValue) {
      notifications.show({
        message: "Field name cannot be empty",
        color: "red",
      });
      setEditingField(null);
      return;
    }

    // Check for duplicate names
    if (
      trimmedValue !== editingField &&
      modelFields.includes(trimmedValue)
    ) {
      notifications.show({
        message: "Field name already exists",
        color: "red",
      });
      setEditingField(null);
      return;
    }

    // Update field name
    const updatedFields = modelFields.map((f) =>
      f === editingField ? trimmedValue : f,
    );
    setModelFields(updatedFields);

    // Update mappings to reflect new field name
    const updatedMappings = fieldMappings.map((m) =>
      m.modelField === editingField
        ? { ...m, modelField: trimmedValue }
        : m,
    );
    setFieldMappings(updatedMappings);

    setEditingField(null);
  };

  const handleCancelEditField = () => {
    setEditingField(null);
    setEditingFieldValue("");
  };

  const handleSaveModel = async () => {
    if (!modelName.trim()) {
      notifications.show({
        message: "Please enter a model name",
        color: "red",
      });
      return;
    }

    if (selectedTopics.length === 0) {
      notifications.show({
        message: "Please add at least one topic",
        color: "red",
      });
      return;
    }

    if (fieldMappings.length === 0) {
      notifications.show({
        message: "Please create at least one field mapping",
        color: "red",
      });
      return;
    }

    // Build model data based on entity type
    const modelData: any = {
      name: modelName,
      type: modelType,
      topics: selectedTopics,
    };

    // Get all mapped fields
    const mappedFields = modelFields.filter((field) =>
      fieldMappings.some((m) => m.modelField === field),
    );

    if (modelType === "data_vault") {
      if (entityType === "hub") {
        modelData.hubs = [
          {
            name: entityName,
            topic: selectedTopics[0],
            business_key: mappedFields[0] || "id",
            fields: mappedFields,
          },
        ];
        modelData.links = [];
        modelData.satellites = [];
      } else if (entityType === "link") {
        modelData.hubs = [];
        modelData.links = [
          {
            name: entityName,
            topic: selectedTopics[0],
            hub_references: ["Hub_1", "Hub_2"],
            fields: mappedFields,
          },
        ];
        modelData.satellites = [];
      } else if (entityType === "satellite") {
        modelData.hubs = [];
        modelData.links = [];
        modelData.satellites = [
          {
            name: entityName,
            topic: selectedTopics[0],
            parent: "Hub_Parent",
            fields: mappedFields,
          },
        ];
      }
    } else {
      if (entityType === "fact") {
        modelData.facts = [
          {
            name: entityName,
            topic: selectedTopics[0],
            grain: "transaction",
            measures: mappedFields,
            dimension_keys: [],
          },
        ];
        modelData.dimensions = [];
      } else {
        modelData.facts = [];
        modelData.dimensions = [
          {
            name: entityName,
            topic: selectedTopics[0],
            key: mappedFields[0] || "id",
            fields: mappedFields,
          },
        ];
      }
    }

    try {
      await createModel.mutateAsync(modelData);
      navigate("/models");
    } catch (error) {
      // Error handled by hook
    }
  };

  const getTopicFields = (topicId: string) => {
    const topic = topics.find((t: any) => String(t.id) === topicId);
    return topic?.current_revision?.schema || [];
  };

  const getTopicInfo = (topicId: string) => {
    return topics.find((t: any) => String(t.id) === topicId);
  };

  const availableTopics = topics.filter(
    (t: any) => !selectedTopics.includes(String(t.id)),
  );

  // Calculate connection lines
  const calculateConnectionLines = () => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    if (!canvasRef.current) return lines;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    fieldMappings.forEach((mapping) => {
      const colKey = `${mapping.topicId}-${mapping.topicField}`;
      const colElement = topicColRefs.current[colKey];
      const fieldElement = modelFieldRefs.current[mapping.modelField];

      if (colElement && fieldElement) {
        const colRect = colElement.getBoundingClientRect();
        const fieldRect = fieldElement.getBoundingClientRect();

        // Calculate relative positions within canvas
        const x1 = colRect.right - canvasRect.left;
        const y1 = colRect.top + colRect.height / 2 - canvasRect.top;
        const x2 = fieldRect.left - canvasRect.left;
        const y2 = fieldRect.top + fieldRect.height / 2 - canvasRect.top;

        lines.push({ x1, y1, x2, y2 });
      }
    });

    return lines;
  };

  const [connectionLines, setConnectionLines] = useState<
    Array<{ x1: number; y1: number; x2: number; y2: number }>
  >([]);

  // Update connection lines when mappings change
  useEffect(() => {
    const updateLines = () => {
      setConnectionLines(calculateConnectionLines());
    };

    // Initial calculation
    updateLines();

    // Recalculate on scroll or resize
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("scroll", updateLines);
      window.addEventListener("resize", updateLines);
      
      // Also update after a short delay to account for DOM updates
      const timer = setTimeout(updateLines, 100);

      return () => {
        canvas.removeEventListener("scroll", updateLines);
        window.removeEventListener("resize", updateLines);
        clearTimeout(timer);
      };
    }
  }, [fieldMappings, selectedTopics, expandedTopics, modelFields]);

  return (
    <>
      {/* Setup Modal */}
      <Modal
        opened={setupModalOpen}
        onClose={() => {}}
        title="Create Data Model"
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
      >
        <Stack>
          <TextInput
            label="Model Name"
            placeholder="e.g., Customer Analytics"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            required
          />
          <Select
            label="Model Type"
            value={modelType}
            onChange={(v) => {
              setModelType((v as any) || "data_vault");
              setEntityType(v === "data_vault" ? "hub" : "dimension");
            }}
            data={[
              { value: "data_vault", label: "Data Vault" },
              { value: "dimensional", label: "Dimensional" },
            ]}
            required
          />
          <Select
            label="Entity Type"
            value={entityType}
            onChange={(v) => setEntityType((v as EntityType) || "hub")}
            data={
              modelType === "data_vault"
                ? [
                    { value: "hub", label: "Hub - Business Entity" },
                    { value: "link", label: "Link - Relationship" },
                    { value: "satellite", label: "Satellite - Attributes" },
                  ]
                : [
                    { value: "fact", label: "Fact - Measurements" },
                    { value: "dimension", label: "Dimension - Context" },
                  ]
            }
            required
          />
          <TextInput
            label="Entity Name (auto-generated)"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            description="You can customize the auto-generated name"
          />
          <Button onClick={handleSetupComplete} fullWidth>
            Start Building
          </Button>
        </Stack>
      </Modal>

      {/* Canvas Page */}
      <Stack h="calc(100vh - 60px)" p="md" gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" onClick={() => navigate("/models")}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Text size="xl" fw={700}>
                {modelName || "New Model"}
              </Text>
              <Group gap="xs">
                <Badge size="sm" variant="light">
                  {modelType === "data_vault" ? "Data Vault" : "Dimensional"}
                </Badge>
                <Badge size="sm" variant="outline">
                  {entityType}
                </Badge>
              </Group>
            </div>
          </Group>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSaveModel}
            loading={createModel.isPending}
          >
            Save Model
          </Button>
        </Group>

        {/* Single Canvas with SVG overlay */}
        <Box
          ref={canvasRef}
          style={{
            flex: 1,
            position: "relative",
            border: `1px solid ${colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'}`,
            borderRadius: "8px",
            overflow: "auto",
            padding: "1rem",
          }}
          bg={colorScheme === 'dark' ? 'dark.8' : 'gray.0'}
        >
          {/* Add Topic Button in top left */}
          <Box style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button leftSection={<IconPlus size={16} />} size="sm">
                  Add Topic
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {availableTopics.length > 0 ? (
                  availableTopics.map((topic: any) => (
                    <Menu.Item
                      key={topic.id}
                      onClick={() => handleAddTopic(String(topic.id))}
                    >
                      {topic.name}
                    </Menu.Item>
                  ))
                ) : (
                  <Menu.Item disabled>No more topics available</Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Box>

          {/* Canvas Content - Two column layout */}
          <Box
            style={{
              display: "flex",
              justifyContent: "space-between",
              minHeight: "100%",
              paddingTop: "60px",
            }}
          >
            {/* Left side - Topics */}
            <Stack
              gap="md"
              style={{
                width: "400px",
                paddingRight: "2rem",
              }}
            >
              {selectedTopics.map((topicId) => {
                const topic = getTopicInfo(topicId);
                const schema = getTopicFields(topicId);
                const expanded = expandedTopics[topicId];

                return (
                  <Card key={topicId} withBorder shadow="sm" p="md">
                    <Group justify="space-between" mb="xs">
                      <Group gap="xs">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => toggleTopicExpanded(topicId)}
                        >
                          {expanded ? (
                            <IconChevronDown size={16} />
                          ) : (
                            <IconChevronRight size={16} />
                          )}
                        </ActionIcon>
                        <Text fw={600}>{topic?.name}</Text>
                      </Group>
                      <ActionIcon
                        size="sm"
                        color="red"
                        variant="subtle"
                        onClick={() => handleRemoveTopic(topicId)}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    </Group>

                    {topic?.description && (
                      <Text size="sm" c="dimmed" mb="xs">
                        {topic.description}
                      </Text>
                    )}

                    <Collapse in={expanded}>
                      <Divider my="xs" />
                      <Text size="xs" c="dimmed" mb="xs">
                        Columns - drag handle to map
                      </Text>
                      <Stack gap={4}>
                        {schema.map((col: any) => {
                          const mappedCount = fieldMappings.filter(
                            (m) =>
                              m.topicId === topicId && m.topicField === col.name,
                          ).length;
                          const colKey = `${topicId}-${col.name}`;

                          return (
                            <Paper
                              key={col.name}
                              ref={(el) => (topicColRefs.current[colKey] = el)}
                              p="xs"
                              withBorder
                              bg={
                                mappedCount > 0
                                  ? colorScheme === "dark"
                                    ? "green.9"
                                    : "green.0"
                                  : undefined
                              }
                            >
                              <Group justify="space-between" wrap="nowrap">
                                <Box style={{ flex: 1 }}>
                                  <Text size="sm" fw={500}>
                                    {col.name}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {col.data_type}
                                  </Text>
                                </Box>
                                <ActionIcon
                                  size="lg"
                                  variant="light"
                                  color="blue"
                                  draggable
                                  onDragStart={() =>
                                    handleColumnDragStart(topicId, col.name)
                                  }
                                  onDragEnd={handleColumnDragEnd}
                                  style={{ cursor: "grab" }}
                                  title="Drag to map to model field"
                                >
                                  <IconGripVertical size={18} />
                                </ActionIcon>
                              </Group>
                              {mappedCount > 0 && (
                                <Badge size="xs" color="green" mt={4}>
                                  {mappedCount} mapping{mappedCount > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </Card>
                );
              })}
            </Stack>

            {/* Right side - Model */}
            <Box
              style={{
                width: "400px",
                paddingLeft: "2rem",
              }}
            >
              <Card withBorder shadow="lg" p="md">
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={700} size="lg">
                      {entityName}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Data Model
                    </Text>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={handleAddModelField}
                  >
                    Add Field
                  </Button>
                </Group>

                <Divider mb="md" />

                <Stack gap="xs">
                  {modelFields.length === 0 ? (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      Click "Add Field" to create fields
                    </Text>
                  ) : (
                    modelFields.map((fieldName) => {
                      const mappings = fieldMappings.filter(
                        (m) => m.modelField === fieldName,
                      );
                      const isEditing = editingField === fieldName;

                      return (
                        <Paper
                          key={fieldName}
                          ref={(el) => (modelFieldRefs.current[fieldName] = el)}
                          p="sm"
                          withBorder
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleFieldDrop(fieldName)}
                          bg={
                            mappings.length > 0
                              ? colorScheme === "dark"
                                ? "blue.9"
                                : "blue.0"
                              : undefined
                          }
                          style={{
                            border:
                              draggedColumn && mappings.length === 0
                                ? "2px dashed var(--mantine-color-blue-5)"
                                : undefined,
                          }}
                        >
                          <Group justify="space-between" align="flex-start">
                            <Box style={{ flex: 1 }}>
                              <Group gap="xs" mb={4}>
                                {isEditing ? (
                                  <TextInput
                                    size="sm"
                                    value={editingFieldValue}
                                    onChange={(e) =>
                                      setEditingFieldValue(e.target.value)
                                    }
                                    onBlur={handleFinishEditField}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleFinishEditField();
                                      } else if (e.key === "Escape") {
                                        handleCancelEditField();
                                      }
                                    }}
                                    autoFocus
                                    styles={{ input: { fontWeight: 600 } }}
                                  />
                                ) : (
                                  <>
                                    <Text size="sm" fw={600}>
                                      {fieldName}
                                    </Text>
                                    <ActionIcon
                                      size="xs"
                                      variant="subtle"
                                      onClick={() => handleStartEditField(fieldName)}
                                      title="Edit field name"
                                    >
                                      <IconEdit size={12} />
                                    </ActionIcon>
                                  </>
                                )}
                                {mappings.length === 0 && !isEditing && (
                                  <Badge size="xs" color="gray" variant="outline">
                                    unmapped
                                  </Badge>
                                )}
                              </Group>
                              
                              {/* Hash note for Data Vault key fields */}
                              {(entityType === "hub" && fieldName === "business_key" ||
                                entityType === "link" && fieldName === "link_key" ||
                                entityType === "satellite" && fieldName === "parent_key") && (
                                <Group gap={4} mt={4}>
                                  <IconInfoCircle size={12} style={{ color: "var(--mantine-color-dimmed)" }} />
                                  <Text size="xs" c="dimmed" italic>
                                    Values will be hashed
                                  </Text>
                                </Group>
                              )}

                              {mappings.length > 0 && (
                                <Stack gap={4}>
                                  {mappings.map((mapping, idx) => {
                                    const topic = getTopicInfo(mapping.topicId);
                                    return (
                                      <Group key={idx} gap="xs">
                                        <Badge
                                          size="sm"
                                          variant="light"
                                          pr={3}
                                          rightSection={
                                            <ActionIcon
                                              size="xs"
                                              color="gray"
                                              radius="xl"
                                              variant="transparent"
                                              onClick={() =>
                                                handleRemoveMapping(mapping)
                                              }
                                            >
                                              <IconX size={10} />
                                            </ActionIcon>
                                          }
                                        >
                                          {topic?.name}.{mapping.topicField}
                                        </Badge>
                                      </Group>
                                    );
                                  })}
                                </Stack>
                              )}
                            </Box>
                            <ActionIcon
                              size="sm"
                              color="red"
                              variant="subtle"
                              onClick={() => handleRemoveModelField(fieldName)}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Group>
                        </Paper>
                      );
                    })
                  )}
                </Stack>
              </Card>
            </Box>
          </Box>

          {/* SVG overlay for connection lines */}
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
            {connectionLines.map((line, idx) => (
              <g key={idx}>
                {/* Draw line with arrow */}
                <defs>
                  <marker
                    id={`arrowhead-${idx}`}
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3, 0 6"
                      fill={colorScheme === 'dark' ? '#4dabf7' : '#1c7ed6'}
                    />
                  </marker>
                </defs>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={colorScheme === 'dark' ? '#4dabf7' : '#1c7ed6'}
                  strokeWidth="2"
                  markerEnd={`url(#arrowhead-${idx})`}
                />
              </g>
            ))}
          </svg>
        </Box>
      </Stack>
    </>
  );
}
