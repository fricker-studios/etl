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
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useTopics } from "../../hooks/useTopics";
import { useCreateModel } from "../../hooks/useModels";

// Entity types
type EntityType = "hub" | "link" | "satellite" | "fact" | "dimension";

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
  const [entityType, setEntityType] = useState<EntityType>("hub");
  const [entityName, setEntityName] = useState("");
  const [topic, setTopic] = useState("");

  // Field mappings
  const [businessKey, setBusinessKey] = useState("");
  const [attributes, setAttributes] = useState<string[]>([]);
  const [hubReferences, setHubReferences] = useState<string[]>([]);
  const [linkFields, setLinkFields] = useState<string[]>([]);
  const [parentHub, setParentHub] = useState("");
  const [primaryKey, setPrimaryKey] = useState("");
  const [grain, setGrain] = useState("");
  const [measures, setMeasures] = useState<string[]>([]);
  const [dimensionKeys, setDimensionKeys] = useState<string[]>([]);

  const topicOptions = topics.map((t: any) => ({
    value: String(t.id),
    label: t.name,
  }));

  const getTopicFields = (topicId: string) => {
    const topicData = topics.find((t: any) => String(t.id) === topicId);
    if (!topicData?.current_revision?.schema) return [];
    return topicData.current_revision.schema.map((col: any) => ({
      value: col.name,
      label: `${col.name} (${col.data_type})`,
    }));
  };

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

  const resetForm = () => {
    setActive(0);
    setName("");
    setEntityType("hub");
    setEntityName("");
    setTopic("");
    setBusinessKey("");
    setAttributes([]);
    setHubReferences([]);
    setLinkFields([]);
    setParentHub("");
    setPrimaryKey("");
    setGrain("");
    setMeasures([]);
    setDimensionKeys([]);
  };

  const save = async () => {
    if (!name.trim()) {
      notifications.show({
        message: "Please enter a model name",
        color: "red",
      });
      return;
    }

    if (!entityName.trim()) {
      notifications.show({
        message: "Please enter an entity name",
        color: "red",
      });
      return;
    }

    if (!topic) {
      notifications.show({ message: "Please select a topic", color: "red" });
      return;
    }

    // Type-specific validation
    if (entityType === "hub" && !businessKey) {
      notifications.show({
        message: "Please select a business key",
        color: "red",
      });
      return;
    }

    if (entityType === "dimension" && !primaryKey) {
      notifications.show({
        message: "Please select a primary key",
        color: "red",
      });
      return;
    }

    if (entityType === "fact" && !grain) {
      notifications.show({ message: "Please enter a grain", color: "red" });
      return;
    }

    if (entityType === "satellite" && !parentHub) {
      notifications.show({
        message: "Please enter a parent hub name",
        color: "red",
      });
      return;
    }

    if (entityType === "link" && hubReferences.length < 2) {
      notifications.show({
        message: "Please enter at least 2 hub references",
        color: "red",
      });
      return;
    }

    const modelData: any = {
      name,
      type,
      topics: [topic],
      entity_type: entityType,
    };

    // Build entity based on type
    if (type === "data_vault") {
      if (entityType === "hub") {
        modelData.hubs = [
          {
            name: entityName,
            topic: topic,
            business_key: businessKey,
            fields: attributes,
          },
        ];
        modelData.links = [];
        modelData.satellites = [];
      } else if (entityType === "link") {
        modelData.hubs = [];
        modelData.links = [
          {
            name: entityName,
            topic: topic,
            hub_references: hubReferences,
            fields: linkFields,
          },
        ];
        modelData.satellites = [];
      } else if (entityType === "satellite") {
        modelData.hubs = [];
        modelData.links = [];
        modelData.satellites = [
          {
            name: entityName,
            topic: topic,
            parent: parentHub,
            fields: attributes,
          },
        ];
      }
    } else {
      if (entityType === "fact") {
        modelData.facts = [
          {
            name: entityName,
            topic: topic,
            grain: grain,
            measures: measures,
            dimension_keys: dimensionKeys,
          },
        ];
        modelData.dimensions = [];
      } else if (entityType === "dimension") {
        modelData.facts = [];
        modelData.dimensions = [
          {
            name: entityName,
            topic: topic,
            key: primaryKey,
            fields: attributes,
          },
        ];
      }
    }

    try {
      await createModel.mutateAsync(modelData);
      resetForm();
      onClose();
    } catch (error) {
      // Error handled by mutation hook
    }
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
              data={getEntityTypeOptions()}
              required
              description="The type of entity this model represents"
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

        <Stepper.Step label="Define Entity">
          <Stack>
            <TextInput
              label="Entity Name"
              placeholder="e.g., Hub_Customer, Dim_Date"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              required
            />

            <Select
              label="Source Topic"
              data={topicOptions}
              value={topic}
              onChange={(v) => {
                setTopic(v || "");
                // Reset field selections when topic changes
                setBusinessKey("");
                setAttributes([]);
                setHubReferences([]);
                setLinkFields([]);
                setPrimaryKey("");
                setMeasures([]);
                setDimensionKeys([]);
              }}
              searchable
              required
            />

            {topic && (
              <>
                <Divider label="Field Mappings" />

                {entityType === "hub" && (
                  <>
                    <Select
                      label="Business Key *"
                      data={getTopicFields(topic)}
                      value={businessKey}
                      onChange={(v) => setBusinessKey(v || "")}
                      searchable
                      required
                      description="Natural business key that uniquely identifies this entity"
                    />
                    <MultiSelect
                      label="Additional Attributes"
                      data={getTopicFields(topic)}
                      value={attributes}
                      onChange={setAttributes}
                      searchable
                      description="Additional fields to store with the hub (optional)"
                    />
                  </>
                )}

                {entityType === "link" && (
                  <>
                    <TextInput
                      label="Hub References *"
                      placeholder="Enter hub names separated by commas (e.g., Hub_Customer, Hub_Order)"
                      value={hubReferences.join(", ")}
                      onChange={(e) => {
                        const refs = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        setHubReferences(refs);
                      }}
                      required
                      description="Enter at least 2 hub names to create a relationship"
                      error={
                        hubReferences.length > 0 && hubReferences.length < 2
                          ? "Enter at least 2 hubs"
                          : undefined
                      }
                    />
                    <MultiSelect
                      label="Link Fields"
                      data={getTopicFields(topic)}
                      value={linkFields}
                      onChange={setLinkFields}
                      searchable
                      description="Fields that describe the relationship (optional)"
                    />
                  </>
                )}

                {entityType === "satellite" && (
                  <>
                    <TextInput
                      label="Parent Hub *"
                      placeholder="e.g., Hub_Customer"
                      value={parentHub}
                      onChange={(e) => setParentHub(e.target.value)}
                      required
                      description="The hub this satellite extends"
                    />
                    <MultiSelect
                      label="Attribute Fields *"
                      data={getTopicFields(topic)}
                      value={attributes}
                      onChange={setAttributes}
                      searchable
                      description="Descriptive attributes that change over time"
                      required
                    />
                  </>
                )}

                {entityType === "fact" && (
                  <>
                    <TextInput
                      label="Grain *"
                      placeholder="e.g., transaction, order_line, daily_snapshot"
                      value={grain}
                      onChange={(e) => setGrain(e.target.value)}
                      description="The level of detail for this fact table (one row per...)"
                      required
                    />
                    <MultiSelect
                      label="Measures *"
                      data={getTopicFields(topic)}
                      value={measures}
                      onChange={setMeasures}
                      searchable
                      description="Quantitative fields to analyze (e.g., amount, quantity, revenue)"
                      required
                    />
                    <MultiSelect
                      label="Dimension Keys"
                      data={getTopicFields(topic)}
                      value={dimensionKeys}
                      onChange={setDimensionKeys}
                      searchable
                      description="Keys that reference dimension tables (e.g., customer_id, date_id)"
                    />
                  </>
                )}

                {entityType === "dimension" && (
                  <>
                    <Select
                      label="Primary Key *"
                      data={getTopicFields(topic)}
                      value={primaryKey}
                      onChange={(v) => setPrimaryKey(v || "")}
                      searchable
                      required
                      description="The surrogate or natural key for this dimension"
                    />
                    <MultiSelect
                      label="Attribute Fields *"
                      data={getTopicFields(topic)}
                      value={attributes}
                      onChange={setAttributes}
                      searchable
                      description="Descriptive attributes for this dimension (e.g., name, category, description)"
                      required
                    />
                  </>
                )}
              </>
            )}

            <Group justify="space-between">
              <Button variant="light" onClick={() => setActive(0)}>
                Back
              </Button>
              <Button onClick={() => setActive(2)} disabled={!topic}>
                Next
              </Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Review">
          <Stack>
            <Divider label="Model Summary" />
            <Text size="sm">
              <strong>Name:</strong> {name}
            </Text>
            <Text size="sm">
              <strong>Model Type:</strong>{" "}
              {type === "data_vault" ? "Data Vault" : "Dimensional"}
            </Text>
            <Text size="sm">
              <strong>Entity Type:</strong> {entityType}
            </Text>
            <Text size="sm">
              <strong>Entity Name:</strong> {entityName}
            </Text>
            <Text size="sm">
              <strong>Topic:</strong>{" "}
              {topics.find((t: any) => String(t.id) === topic)?.name || "-"}
            </Text>

            <Divider label="Field Mappings" />
            {entityType === "hub" && (
              <>
                <Text size="sm">
                  <strong>Business Key:</strong> {businessKey}
                </Text>
                <Text size="sm">
                  <strong>Attributes:</strong>{" "}
                  {attributes.length > 0 ? attributes.join(", ") : "None"}
                </Text>
              </>
            )}
            {entityType === "link" && (
              <>
                <Text size="sm">
                  <strong>Hub References:</strong> {hubReferences.join(", ")}
                </Text>
                <Text size="sm">
                  <strong>Link Fields:</strong>{" "}
                  {linkFields.length > 0 ? linkFields.join(", ") : "None"}
                </Text>
              </>
            )}
            {entityType === "satellite" && (
              <>
                <Text size="sm">
                  <strong>Parent Hub:</strong> {parentHub}
                </Text>
                <Text size="sm">
                  <strong>Attributes:</strong> {attributes.join(", ")}
                </Text>
              </>
            )}
            {entityType === "fact" && (
              <>
                <Text size="sm">
                  <strong>Grain:</strong> {grain}
                </Text>
                <Text size="sm">
                  <strong>Measures:</strong> {measures.join(", ")}
                </Text>
                <Text size="sm">
                  <strong>Dimension Keys:</strong>{" "}
                  {dimensionKeys.length > 0 ? dimensionKeys.join(", ") : "None"}
                </Text>
              </>
            )}
            {entityType === "dimension" && (
              <>
                <Text size="sm">
                  <strong>Primary Key:</strong> {primaryKey}
                </Text>
                <Text size="sm">
                  <strong>Attributes:</strong> {attributes.join(", ")}
                </Text>
              </>
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
