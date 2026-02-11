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
  Divider,
} from "@mantine/core";
import {
  IconPlus,
  IconChevronDown,
  IconChevronRight,
  IconArrowLeft,
  IconDeviceFloppy,
  IconX,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDisclosure } from "@mantine/hooks";
import { useTopics } from "../hooks/useTopics";
import { useCreateModel } from "../hooks/useModels";
import { notifications } from "@mantine/notifications";

type EntityType = "hub" | "link" | "satellite" | "fact" | "dimension";

interface FieldMapping {
  topicId: string;
  topicField: string;
  modelField: string;
  role?: string; // business_key, measure, attribute, etc.
}

export function ModelCanvasPage() {
  const navigate = useNavigate();
  const { data: topics = [] } = useTopics();
  const createModel = useCreateModel();

  // Setup modal state
  const [setupModalOpen, { close: closeSetup }] = useDisclosure(true);
  const [modelName, setModelName] = useState("");
  const [modelType, setModelType] = useState<"data_vault" | "dimensional">("data_vault");
  const [entityType, setEntityType] = useState<EntityType>("hub");
  const [entityName, setEntityName] = useState("");

  // Canvas state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [modelFields, setModelFields] = useState<string[]>([]);
  const [draggedField, setDraggedField] = useState<{ topicId: string; field: string } | null>(null);

  // Auto-generate entity name when model name changes
  useEffect(() => {
    if (modelName && !entityName) {
      const prefix = entityType === "hub" ? "Hub" :
                     entityType === "link" ? "Link" :
                     entityType === "satellite" ? "Sat" :
                     entityType === "fact" ? "Fact" : "Dim";
      const cleanName = modelName.replace(/[^a-zA-Z0-9]/g, "");
      setEntityName(`${prefix}_${cleanName}`);
    }
  }, [modelName, entityType, entityName]);

  const handleSetupComplete = () => {
    if (!modelName.trim()) {
      notifications.show({ message: "Please enter a model name", color: "red" });
      return;
    }
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

  const handleFieldDragStart = (topicId: string, field: string) => {
    setDraggedField({ topicId, field });
  };

  const handleFieldDrop = (e: React.DragEvent, role?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedField) return;

    const fieldName = draggedField.field;
    
    // Check if field is already mapped
    const existingMapping = fieldMappings.find(
      (m) => m.topicId === draggedField.topicId && m.topicField === fieldName
    );

    if (existingMapping) {
      notifications.show({ message: "Field already mapped", color: "orange" });
      setDraggedField(null);
      return;
    }

    // Add field to model
    if (!modelFields.includes(fieldName)) {
      setModelFields([...modelFields, fieldName]);
    }

    // Add mapping
    setFieldMappings([
      ...fieldMappings,
      {
        topicId: draggedField.topicId,
        topicField: fieldName,
        modelField: fieldName,
        role: role,
      },
    ]);

    setDraggedField(null);
  };

  const handleRemoveField = (mapping: FieldMapping) => {
    setFieldMappings(fieldMappings.filter((m) => 
      !(m.topicId === mapping.topicId && m.topicField === mapping.topicField)
    ));
    // Also remove from modelFields if no other mapping uses it
    const stillUsed = fieldMappings.some((m) => 
      m.modelField === mapping.modelField && 
      !(m.topicId === mapping.topicId && m.topicField === mapping.topicField)
    );
    if (!stillUsed) {
      setModelFields(modelFields.filter((f) => f !== mapping.modelField));
    }
  };

  const handleSaveModel = async () => {
    if (!modelName.trim()) {
      notifications.show({ message: "Please enter a model name", color: "red" });
      return;
    }

    if (selectedTopics.length === 0) {
      notifications.show({ message: "Please add at least one topic", color: "red" });
      return;
    }

    if (fieldMappings.length === 0) {
      notifications.show({ message: "Please map at least one field", color: "red" });
      return;
    }

    // Build model data based on entity type
    const modelData: any = {
      name: modelName,
      type: modelType,
      topics: selectedTopics,
    };

    // Get mapped fields by role
    const businessKey = fieldMappings.find((m) => m.role === "business_key")?.modelField || modelFields[0];
    const attributes = fieldMappings.filter((m) => !m.role || m.role === "attribute").map((m) => m.modelField);
    const measures = fieldMappings.filter((m) => m.role === "measure").map((m) => m.modelField);
    const dimensionKeys = fieldMappings.filter((m) => m.role === "dimension_key").map((m) => m.modelField);

    if (modelType === "data_vault") {
      if (entityType === "hub") {
        modelData.hubs = [{
          name: entityName,
          topic: selectedTopics[0],
          business_key: businessKey,
          fields: attributes,
        }];
        modelData.links = [];
        modelData.satellites = [];
      } else if (entityType === "link") {
        modelData.hubs = [];
        modelData.links = [{
          name: entityName,
          topic: selectedTopics[0],
          hub_references: ["Hub_1", "Hub_2"], // Placeholder
          fields: modelFields,
        }];
        modelData.satellites = [];
      } else if (entityType === "satellite") {
        modelData.hubs = [];
        modelData.links = [];
        modelData.satellites = [{
          name: entityName,
          topic: selectedTopics[0],
          parent: "Hub_Parent", // Placeholder
          fields: modelFields,
        }];
      }
    } else {
      if (entityType === "fact") {
        modelData.facts = [{
          name: entityName,
          topic: selectedTopics[0],
          grain: "transaction",
          measures: measures.length > 0 ? measures : modelFields,
          dimension_keys: dimensionKeys,
        }];
        modelData.dimensions = [];
      } else {
        modelData.facts = [];
        modelData.dimensions = [{
          name: entityName,
          topic: selectedTopics[0],
          key: businessKey,
          fields: attributes,
        }];
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

  const availableTopics = topics.filter(
    (t: any) => !selectedTopics.includes(String(t.id))
  );

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
      <Stack h="calc(100vh - 60px)" p="md">
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

        <Box
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "300px 1fr 300px",
            gap: "1rem",
            overflow: "hidden",
          }}
        >
          {/* Left Panel - Available Topics */}
          <Card withBorder p="md" style={{ overflow: "auto" }}>
            <Text fw={600} mb="md">
              Available Topics
            </Text>
            <Stack gap="xs">
              {availableTopics.map((topic: any) => (
                <Paper
                  key={topic.id}
                  withBorder
                  p="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleAddTopic(String(topic.id))}
                >
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>
                      {topic.name}
                    </Text>
                    <ActionIcon size="sm" variant="light">
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))}
              {availableTopics.length === 0 && (
                <Text c="dimmed" size="sm">
                  All topics added
                </Text>
              )}
            </Stack>
          </Card>

          {/* Center - Canvas */}
          <Card withBorder p="md" style={{ overflow: "auto", position: "relative" }}>
            <Text fw={600} mb="md">
              Model Canvas
            </Text>
            <Stack gap="md">
              {/* Topics on Canvas */}
              {selectedTopics.map((topicId) => {
                const topic = topics.find((t: any) => String(t.id) === topicId);
                const schema = getTopicFields(topicId);
                const expanded = expandedTopics[topicId];

                return (
                  <Card key={topicId} withBorder shadow="sm">
                    <Group justify="space-between" mb="xs">
                      <Group>
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
                        <Badge variant="dot">Topic</Badge>
                        <Text fw={600}>{topic?.name}</Text>
                      </Group>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemoveTopic(topicId)}
                      >
                        Remove
                      </Button>
                    </Group>

                    <Collapse in={expanded}>
                      <Divider my="xs" />
                      <Text size="sm" c="dimmed" mb="xs">
                        Drag fields to the model →
                      </Text>
                      <Stack gap={4}>
                        {schema.map((col: any) => {
                          const isMapped = fieldMappings.some(
                            (m) => m.topicId === topicId && m.topicField === col.name
                          );
                          return (
                            <Paper
                              key={col.name}
                              p="xs"
                              withBorder
                              draggable
                              onDragStart={() => handleFieldDragStart(topicId, col.name)}
                              style={{
                                cursor: isMapped ? "default" : "grab",
                                opacity: isMapped ? 0.5 : 1,
                                backgroundColor: isMapped ? "var(--mantine-color-gray-1)" : undefined,
                              }}
                            >
                              <Group justify="space-between">
                                <Text size="sm">{col.name}</Text>
                                <Text size="xs" c="dimmed">
                                  {col.data_type}
                                </Text>
                              </Group>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </Card>
                );
              })}
            </Stack>
          </Card>

          {/* Right Panel - Model Definition */}
          <Card
            withBorder
            p="md"
            style={{ overflow: "auto" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleFieldDrop(e)}
          >
            <Badge variant="filled" mb="md">
              Model: {entityName}
            </Badge>
            <Text fw={600} mb="md">
              Mapped Fields
            </Text>

            {/* Drop zones for specific roles */}
            {entityType === "hub" && (
              <Paper
                withBorder
                p="sm"
                mb="xs"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFieldDrop(e, "business_key")}
                style={{ backgroundColor: "var(--mantine-color-blue-0)" }}
              >
                <Text size="sm" fw={600} mb={4}>
                  Business Key (drop here)
                </Text>
                <Group gap="xs">
                  {fieldMappings
                    .filter((m) => m.role === "business_key")
                    .map((m, idx) => {
                      const topic = topics.find((t: any) => String(t.id) === m.topicId);
                      return (
                        <Badge
                          key={idx}
                          variant="filled"
                          pr={3}
                          rightSection={
                            <ActionIcon
                              size="xs"
                              color="blue"
                              radius="xl"
                              variant="transparent"
                              onClick={() => handleRemoveField(m)}
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          }
                        >
                          {m.modelField} ← {topic?.name}
                        </Badge>
                      );
                    })}
                </Group>
              </Paper>
            )}

            {entityType === "fact" && (
              <Paper
                withBorder
                p="sm"
                mb="xs"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFieldDrop(e, "measure")}
                style={{ backgroundColor: "var(--mantine-color-blue-0)" }}
              >
                <Text size="sm" fw={600} mb={4}>
                  Measures (drop here)
                </Text>
                <Group gap="xs">
                  {fieldMappings
                    .filter((m) => m.role === "measure")
                    .map((m, idx) => {
                      const topic = topics.find((t: any) => String(t.id) === m.topicId);
                      return (
                        <Badge
                          key={idx}
                          variant="filled"
                          color="blue"
                          pr={3}
                          rightSection={
                            <ActionIcon
                              size="xs"
                              color="blue"
                              radius="xl"
                              variant="transparent"
                              onClick={() => handleRemoveField(m)}
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          }
                        >
                          {m.modelField} ← {topic?.name}
                        </Badge>
                      );
                    })}
                </Group>
              </Paper>
            )}

            <Paper
              withBorder
              p="sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleFieldDrop(e, "attribute")}
              style={{ backgroundColor: "var(--mantine-color-gray-0)" }}
            >
              <Text size="sm" fw={600} mb={4}>
                {entityType === "fact" ? "Dimension Keys" : "Attributes"} (drop here)
              </Text>
              <Stack gap={4}>
                {fieldMappings
                  .filter((m) => !m.role || m.role === "attribute")
                  .map((m, idx) => {
                    const topic = topics.find((t: any) => String(t.id) === m.topicId);
                    return (
                      <Badge
                        key={idx}
                        variant="light"
                        pr={3}
                        rightSection={
                          <ActionIcon
                            size="xs"
                            color="gray"
                            radius="xl"
                            variant="transparent"
                            onClick={() => handleRemoveField(m)}
                          >
                            <IconX size={12} />
                          </ActionIcon>
                        }
                      >
                        {m.modelField} ← {topic?.name}
                      </Badge>
                    );
                  })}
              </Stack>
            </Paper>

            {fieldMappings.length === 0 && (
              <Text c="dimmed" size="sm" ta="center" mt="xl">
                Drag fields from topics to map them
              </Text>
            )}
          </Card>
        </Box>
      </Stack>
    </>
  );
}
