import {
  Modal,
  Stepper,
  Group,
  Button,
  Stack,
  TextInput,
  Select,
  MultiSelect,
  Divider,
  Text,
  Card,
  Table,
  ActionIcon,
  Tooltip,
  Badge,
} from "@mantine/core";
import { useState, useMemo } from "react";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash, IconEdit } from "@tabler/icons-react";
import { useTopics } from "../../hooks/useTopics";
import { useCreateModel } from "../../hooks/useModels";

// Entity types
type EntityType = "hub" | "link" | "satellite" | "fact" | "dimension";

interface EntityDefinition {
  id: string;
  name: string;
  type: EntityType;
  topic: string;
  fieldMappings: {
    businessKey?: string;
    parent?: string;
    hubReferences?: string[];
    key?: string;
    grain?: string;
    measures?: string[];
    dimensionKeys?: string[];
    attributes?: string[];
    fields?: string[];
  };
}

export function ModelWizard({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { data: topics = [] } = useTopics();
  const createModel = useCreateModel();
  const [active, setActive] = useState(0);

  const [type, setType] = useState<"data_vault" | "dimensional">("data_vault");
  const [name, setName] = useState("");
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [editingEntity, setEditingEntity] = useState<EntityDefinition | null>(null);

  const topicOptions = topics.map((t: any) => ({
    value: String(t.id),
    label: t.name,
  }));

  const getTopicFields = (topicId: string) => {
    const topic = topics.find((t: any) => String(t.id) === topicId);
    if (!topic?.current_revision?.schema) return [];
    return topic.current_revision.schema.map((col: any) => ({
      value: col.name,
      label: `${col.name} (${col.data_type})`,
    }));
  };

  const selectedTopics = useMemo(() => {
    const topicSet = new Set(entities.map((e) => e.topic).filter(Boolean));
    return Array.from(topicSet);
  }, [entities]);

  const getEntityTypeOptions = () => {
    if (type === "data_vault") {
      return [
        { value: "hub", label: "Hub - Business Entity" },
        { value: "link", label: "Link - Relationship" },
        { value: "satellite", label: "Satellite - Attributes" },
      ];
    } else {
      return [
        { value: "fact", label: "Fact - Measurements" },
        { value: "dimension", label: "Dimension - Context" },
      ];
    }
  };

  const generateId = () => `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const resetForm = () => {
    setActive(0);
    setName("");
    setType("data_vault");
    setEntities([]);
    setEditingEntity(null);
  };

  const save = async () => {
    if (!name.trim()) {
      notifications.show({ message: "Please enter a model name", color: "red" });
      return;
    }

    if (entities.length === 0) {
      notifications.show({ message: "Please define at least one entity", color: "red" });
      return;
    }

    const modelData: any = { name, type, topics: selectedTopics };

    if (type === "data_vault") {
      modelData.hubs = entities
        .filter((e) => e.type === "hub")
        .map((e) => ({
          name: e.name,
          topic: e.topic,
          business_key: e.fieldMappings.businessKey || "",
          fields: e.fieldMappings.attributes || [],
        }));

      modelData.links = entities
        .filter((e) => e.type === "link")
        .map((e) => ({
          name: e.name,
          topic: e.topic,
          hub_references: e.fieldMappings.hubReferences || [],
          fields: e.fieldMappings.fields || [],
        }));

      modelData.satellites = entities
        .filter((e) => e.type === "satellite")
        .map((e) => ({
          name: e.name,
          topic: e.topic,
          parent: e.fieldMappings.parent || "",
          fields: e.fieldMappings.attributes || [],
        }));
    } else {
      modelData.facts = entities
        .filter((e) => e.type === "fact")
        .map((e) => ({
          name: e.name,
          topic: e.topic,
          grain: e.fieldMappings.grain || "",
          measures: e.fieldMappings.measures || [],
          dimension_keys: e.fieldMappings.dimensionKeys || [],
        }));

      modelData.dimensions = entities
        .filter((e) => e.type === "dimension")
        .map((e) => ({
          name: e.name,
          topic: e.topic,
          key: e.fieldMappings.key || "",
          fields: e.fieldMappings.attributes || [],
        }));
    }

    try {
      await createModel.mutateAsync(modelData);
      resetForm();
      onClose();
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const startAddEntity = () => {
    const defaultType: EntityType = type === "data_vault" ? "hub" : "dimension";
    setEditingEntity({
      id: generateId(),
      name: "",
      type: defaultType,
      topic: "",
      fieldMappings: {},
    });
  };

  const startEditEntity = (entity: EntityDefinition) => {
    setEditingEntity({ ...entity });
  };

  const cancelEditEntity = () => {
    setEditingEntity(null);
  };

  const saveEntity = () => {
    if (!editingEntity) return;

    if (!editingEntity.name.trim()) {
      notifications.show({ message: "Please enter entity name", color: "red" });
      return;
    }

    if (!editingEntity.topic) {
      notifications.show({ message: "Please select a topic", color: "red" });
      return;
    }

    if (editingEntity.type === "hub" && !editingEntity.fieldMappings.businessKey) {
      notifications.show({ message: "Please select a business key", color: "red" });
      return;
    }

    if (editingEntity.type === "dimension" && !editingEntity.fieldMappings.key) {
      notifications.show({ message: "Please select a key field", color: "red" });
      return;
    }

    if (editingEntity.type === "fact" && !editingEntity.fieldMappings.grain) {
      notifications.show({ message: "Please enter a grain", color: "red" });
      return;
    }

    if (editingEntity.type === "satellite" && !editingEntity.fieldMappings.parent) {
      notifications.show({ message: "Please select a parent hub", color: "red" });
      return;
    }

    if (editingEntity.type === "link" && (editingEntity.fieldMappings.hubReferences || []).length < 2) {
      notifications.show({ message: "Please select at least 2 hubs to link", color: "red" });
      return;
    }

    const existingIndex = entities.findIndex((e) => e.id === editingEntity.id);
    if (existingIndex >= 0) {
      const newEntities = [...entities];
      newEntities[existingIndex] = editingEntity;
      setEntities(newEntities);
    } else {
      setEntities([...entities, editingEntity]);
    }

    setEditingEntity(null);
  };

  const deleteEntity = (id: string) => {
    setEntities(entities.filter((e) => e.id !== id));
  };

  const getHubNames = () => {
    return entities.filter((e) => e.type === "hub").map((e) => e.name);
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Create Data Model"
      size="xl"
    >
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label="Basics">
          <Stack>
            <TextInput
              label="Model name"
              placeholder="e.g., Customer Analytics Model"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Select
              label="Model type"
              value={type}
              onChange={(v) => {
                setType((v as any) ?? "data_vault");
                setEntities([]);
              }}
              data={[
                { value: "data_vault", label: "Data Vault (hubs, links, satellites)" },
                { value: "dimensional", label: "Dimensional (facts, dimensions)" },
              ]}
              required
            />
            <Text size="sm" c="dimmed">
              {type === "data_vault"
                ? "Data Vault models organize data into hubs (business entities), links (relationships), and satellites (descriptive attributes)."
                : "Dimensional models organize data into facts (measurements) and dimensions (context)."}
            </Text>
            <Group justify="flex-end">
              <Button onClick={() => setActive(1)}>Next</Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Define Entities">
          {editingEntity ? (
            <Stack>
              <Text fw={500}>
                {entities.find((e) => e.id === editingEntity.id) ? "Edit" : "Add"} Entity
              </Text>

              <TextInput
                label="Entity Name"
                placeholder="e.g., Hub_Customer, Dim_Date"
                value={editingEntity.name}
                onChange={(e) => setEditingEntity({ ...editingEntity, name: e.target.value })}
                required
              />

              <Select
                label="Entity Type"
                data={getEntityTypeOptions()}
                value={editingEntity.type}
                onChange={(v) =>
                  setEditingEntity({
                    ...editingEntity,
                    type: (v as EntityType) || "hub",
                    fieldMappings: {},
                  })
                }
                required
              />

              <Select
                label="Source Topic"
                data={topicOptions}
                value={editingEntity.topic}
                onChange={(v) =>
                  setEditingEntity({
                    ...editingEntity,
                    topic: v || "",
                    fieldMappings: {},
                  })
                }
                searchable
                required
              />

              {editingEntity.topic && (
                <>
                  <Divider label="Field Mappings" />

                  {editingEntity.type === "hub" && (
                    <>
                      <Select
                        label="Business Key *"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.businessKey}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              businessKey: v || "",
                            },
                          })
                        }
                        searchable
                        required
                        description="Natural business key that uniquely identifies this entity"
                      />
                      <MultiSelect
                        label="Attributes"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.attributes || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              attributes: v,
                            },
                          })
                        }
                        searchable
                      />
                    </>
                  )}

                  {editingEntity.type === "link" && (
                    <>
                      <MultiSelect
                        label="Hub References *"
                        data={getHubNames().map((h) => ({ value: h, label: h }))}
                        value={editingEntity.fieldMappings.hubReferences || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              hubReferences: v,
                            },
                          })
                        }
                        description="Select at least 2 hubs to link"
                      />
                      <MultiSelect
                        label="Fields"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.fields || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              fields: v,
                            },
                          })
                        }
                        searchable
                      />
                    </>
                  )}

                  {editingEntity.type === "satellite" && (
                    <>
                      <Select
                        label="Parent Hub *"
                        data={getHubNames().map((h) => ({ value: h, label: h }))}
                        value={editingEntity.fieldMappings.parent}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              parent: v || "",
                            },
                          })
                        }
                        required
                      />
                      <MultiSelect
                        label="Attributes *"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.attributes || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              attributes: v,
                            },
                          })
                        }
                        searchable
                      />
                    </>
                  )}

                  {editingEntity.type === "fact" && (
                    <>
                      <TextInput
                        label="Grain *"
                        placeholder="e.g., transaction, order_line"
                        value={editingEntity.fieldMappings.grain}
                        onChange={(e) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              grain: e.target.value,
                            },
                          })
                        }
                        required
                      />
                      <MultiSelect
                        label="Measures *"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.measures || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              measures: v,
                            },
                          })
                        }
                        searchable
                      />
                      <MultiSelect
                        label="Dimension Keys"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.dimensionKeys || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              dimensionKeys: v,
                            },
                          })
                        }
                        searchable
                      />
                    </>
                  )}

                  {editingEntity.type === "dimension" && (
                    <>
                      <Select
                        label="Primary Key *"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.key}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              key: v || "",
                            },
                          })
                        }
                        searchable
                        required
                      />
                      <MultiSelect
                        label="Attributes *"
                        data={getTopicFields(editingEntity.topic)}
                        value={editingEntity.fieldMappings.attributes || []}
                        onChange={(v) =>
                          setEditingEntity({
                            ...editingEntity,
                            fieldMappings: {
                              ...editingEntity.fieldMappings,
                              attributes: v,
                            },
                          })
                        }
                        searchable
                      />
                    </>
                  )}
                </>
              )}

              <Group justify="flex-end">
                <Button variant="light" onClick={cancelEditEntity}>
                  Cancel
                </Button>
                <Button onClick={saveEntity}>
                  {entities.find((e) => e.id === editingEntity.id) ? "Update" : "Add"}
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Define entities with field mappings for your {type === "data_vault" ? "Data Vault" : "Dimensional"} model
                </Text>
                <Button leftSection={<IconPlus size={16} />} onClick={startAddEntity} size="sm">
                  Add Entity
                </Button>
              </Group>

              {entities.length > 0 ? (
                <Card withBorder>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th>Topic</Table.Th>
                        <Table.Th>Key Info</Table.Th>
                        <Table.Th></Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {entities.map((entity) => {
                        const topic = topics.find((t: any) => String(t.id) === entity.topic);
                        let keyInfo = "";
                        
                        if (entity.type === "hub") keyInfo = entity.fieldMappings.businessKey || "-";
                        else if (entity.type === "dimension") keyInfo = entity.fieldMappings.key || "-";
                        else if (entity.type === "fact") keyInfo = entity.fieldMappings.grain || "-";
                        else if (entity.type === "satellite") keyInfo = entity.fieldMappings.parent || "-";
                        else if (entity.type === "link") keyInfo = (entity.fieldMappings.hubReferences || []).join(", ") || "-";

                        return (
                          <Table.Tr key={entity.id}>
                            <Table.Td>{entity.name}</Table.Td>
                            <Table.Td>
                              <Badge size="sm" variant="light">{entity.type}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{topic?.name || "Unknown"}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs" c="dimmed">{keyInfo}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <ActionIcon variant="subtle" color="blue" onClick={() => startEditEntity(entity)}>
                                  <IconEdit size={16} />
                                </ActionIcon>
                                <ActionIcon variant="subtle" color="red" onClick={() => deleteEntity(entity.id)}>
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Card>
              ) : (
                <Card withBorder p="xl">
                  <Stack align="center">
                    <Text c="dimmed">No entities defined yet</Text>
                  </Stack>
                </Card>
              )}

              <Group justify="space-between">
                <Button variant="light" onClick={() => setActive(0)}>
                  Back
                </Button>
                <Button onClick={() => setActive(2)} disabled={entities.length === 0}>
                  Next
                </Button>
              </Group>
            </Stack>
          )}
        </Stepper.Step>

        <Stepper.Step label="Review">
          <Stack>
            <Divider label="Model Summary" />
            <Text size="sm"><strong>Name:</strong> {name}</Text>
            <Text size="sm"><strong>Type:</strong> {type === "data_vault" ? "Data Vault" : "Dimensional"}</Text>
            <Text size="sm"><strong>Entities:</strong> {entities.length} defined</Text>

            {entities.length > 0 && (
              <Card withBorder>
                <Stack gap="sm">
                  {entities.map((entity) => {
                    const topic = topics.find((t: any) => String(t.id) === entity.topic);
                    return (
                      <div key={entity.id}>
                        <Group>
                          <Badge variant="light">{entity.type}</Badge>
                          <Text fw={500}>{entity.name}</Text>
                          <Text size="sm" c="dimmed">(from {topic?.name})</Text>
                        </Group>
                        <Text size="xs" c="dimmed" ml="md">
                          {entity.type === "hub" && `Key: ${entity.fieldMappings.businessKey}, ${(entity.fieldMappings.attributes || []).length} attrs`}
                          {entity.type === "link" && `Links: ${(entity.fieldMappings.hubReferences || []).join(", ")}`}
                          {entity.type === "satellite" && `Parent: ${entity.fieldMappings.parent}, ${(entity.fieldMappings.attributes || []).length} attrs`}
                          {entity.type === "fact" && `Grain: ${entity.fieldMappings.grain}, ${(entity.fieldMappings.measures || []).length} measures`}
                          {entity.type === "dimension" && `Key: ${entity.fieldMappings.key}, ${(entity.fieldMappings.attributes || []).length} attrs`}
                        </Text>
                      </div>
                    );
                  })}
                </Stack>
              </Card>
            )}

            <Group justify="space-between" mt="md">
              <Button variant="light" onClick={() => setActive(1)}>
                Back
              </Button>
              <Button onClick={save} loading={createModel.isPending}>
                Create Model
              </Button>
            </Group>
          </Stack>
        </Stepper.Step>
      </Stepper>
    </Modal>
  );
}
