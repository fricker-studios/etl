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
} from "@mantine/core";
import { IconArrowLeft, IconEdit, IconTrash } from "@tabler/icons-react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useModel, useDeleteModel } from "../hooks/useModels";
import { PageHeader } from "../components/common/PageHeader";
import { modals } from "@mantine/modals";
import { useDisclosure } from "@mantine/hooks";
import { useTopics } from "../hooks/useTopics";

export function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(id ?? null);
  const deleteModel = useDeleteModel();
  const { data: topics = [] } = useTopics();
  const [editModalOpen, { open: openEditModal }] = useDisclosure(false);

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

        {entityDetails && (
          <Stack gap="md">
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
