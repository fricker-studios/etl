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
import { useState, useMemo } from "react";
import { notifications } from "@mantine/notifications";
import { useTopics } from "../../hooks/useTopics";
import { useCreateModel } from "../../hooks/useModels";

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
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({});

  // Constants for default field limits
  const MAX_HUB_FIELDS = 3;
  const MAX_DIMENSION_FIELDS = 5;

  // Topic options for selection
  const topicOptions = topics.map((t: any) => ({
    value: String(t.id),
    label: t.name,
  }));

  // Get available fields for selected topics
  const availableFields = useMemo(() => {
    const fields: Record<string, string[]> = {};
    selectedTopics.forEach((topicId) => {
      const topic = topics.find((t: any) => String(t.id) === topicId);
      if (topic?.current_revision?.schema) {
        fields[topicId] = topic.current_revision.schema.map((col: any) => col.name);
      }
    });
    return fields;
  }, [topics, selectedTopics]);

  const resetForm = () => {
    setActive(0);
    setName("");
    setType("data_vault");
    setSelectedTopics([]);
    setSelectedFields({});
  };

  const save = async () => {
    if (!name.trim()) {
      notifications.show({ message: "Please enter a model name", color: "red" });
      return;
    }

    if (selectedTopics.length === 0) {
      notifications.show({
        message: "Please select at least one topic",
        color: "red",
      });
      return;
    }

    const modelData: any = {
      name,
      type,
      topics: selectedTopics,
    };

    // Create sample entities based on the type
    if (type === "data_vault") {
      // Create a simple hub from the first topic
      const firstTopicId = selectedTopics[0];
      const firstTopicFields = selectedFields[firstTopicId] || [];
      const businessKey = firstTopicFields[0] || "id";

      modelData.hubs = [
        {
          name: `Hub_${name.replace(/\s+/g, "_")}`,
          topic: firstTopicId,
          business_key: businessKey,
          fields: firstTopicFields.slice(0, MAX_HUB_FIELDS),
        },
      ];
      modelData.links = [];
      modelData.satellites = [];
    } else {
      // Create a simple dimension from the first topic
      const firstTopicId = selectedTopics[0];
      const firstTopicFields = selectedFields[firstTopicId] || [];
      const keyField = firstTopicFields[0] || "id";

      modelData.dimensions = [
        {
          name: `Dim_${name.replace(/\s+/g, "_")}`,
          topic: firstTopicId,
          key: keyField,
          fields: firstTopicFields.slice(0, MAX_DIMENSION_FIELDS),
        },
      ];
      modelData.facts = [];
    }

    try {
      await createModel.mutateAsync(modelData);
      resetForm();
      onClose();
    } catch (error) {
      // Error is handled by the mutation hook
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
              onChange={(v) => setType((v as any) ?? "data_vault")}
              data={[
                {
                  value: "data_vault",
                  label: "Data Vault (hubs, links, satellites)",
                },
                {
                  value: "dimensional",
                  label: "Dimensional (facts, dimensions)",
                },
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

        <Stepper.Step label="Select Topics & Fields">
          <Stack>
            <MultiSelect
              label="Select Topics"
              placeholder="Choose topics for your model"
              data={topicOptions}
              value={selectedTopics}
              onChange={(val) => {
                setSelectedTopics(val);
                // Reset field selections for removed topics
                const newFields = { ...selectedFields };
                Object.keys(newFields).forEach((topicId) => {
                  if (!val.includes(topicId)) {
                    delete newFields[topicId];
                  }
                });
                setSelectedFields(newFields);
              }}
              searchable
              required
              description="Select one or more topics that contain the data for your model"
            />

            {selectedTopics.length > 0 && (
              <>
                <Divider label="Select Fields from Topics" />
                {selectedTopics.map((topicId) => {
                  const topic = topics.find((t: any) => String(t.id) === topicId);
                  const fields = availableFields[topicId] || [];

                  return (
                    <MultiSelect
                      key={topicId}
                      label={`Fields from ${topic?.name || "Topic"}`}
                      placeholder="Select fields to include in the model"
                      data={fields.map((f) => ({ value: f, label: f }))}
                      value={selectedFields[topicId] || []}
                      onChange={(val) =>
                        setSelectedFields({
                          ...selectedFields,
                          [topicId]: val,
                        })
                      }
                      searchable
                      description={`Choose which fields from ${topic?.name || "this topic"} to include`}
                    />
                  );
                })}
              </>
            )}

            <Group justify="space-between">
              <Button variant="light" onClick={() => setActive(0)}>
                Back
              </Button>
              <Button onClick={() => setActive(2)} disabled={selectedTopics.length === 0}>
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
              <strong>Type:</strong> {type === "data_vault" ? "Data Vault" : "Dimensional"}
            </Text>
            <Text size="sm">
              <strong>Topics:</strong> {selectedTopics.length} topic(s) selected
            </Text>

            {selectedTopics.map((topicId) => {
              const topic = topics.find((t: any) => String(t.id) === topicId);
              const fields = selectedFields[topicId] || [];
              return (
                <div key={topicId}>
                  <Text size="sm">
                    <strong>{topic?.name}:</strong> {fields.length} field(s) selected
                    {fields.length > 0 && ` (${fields.join(", ")})`}
                  </Text>
                </div>
              );
            })}

            <Text size="xs" c="dimmed" mt="md">
              {type === "data_vault"
                ? "A basic hub will be created with the selected fields."
                : "A basic dimension will be created with the selected fields."}
            </Text>

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
