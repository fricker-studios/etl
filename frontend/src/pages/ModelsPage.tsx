import { Stack, Card, Table, Badge, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { ModelWizard } from "../features/models/ModelWizard";
import { PageHeader } from "../components/common/PageHeader";
import { useModels } from "../hooks/useModels";

export function ModelsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const { data: models = [], isLoading } = useModels();

  return (
    <Stack>
      <PageHeader
        title="Models"
        description="Define semantic structure using Data Vault or Dimensional modeling."
        action={{
          label: "New model",
          onClick: openIt,
          icon: <IconPlus size={16} />,
        }}
      />

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Topics</Table.Th>
              <Table.Th>Entities</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed">Loading...</Text>
                </Table.Td>
              </Table.Tr>
            ) : models.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed">No models yet.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              models.map((m: any) => {
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td>{m.name}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">
                        {m.type === "data_vault" ? "Data Vault" : "Dimensional"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{m.topics?.length ?? 0} topics</Table.Td>
                    <Table.Td>
                      {m.type === "data_vault" ? (
                        <>
                          {m.hubs?.length || 0} hubs, {m.links?.length || 0} links,{" "}
                          {m.satellites?.length || 0} satellites
                        </>
                      ) : (
                        <>
                          {m.facts?.length || 0} facts, {m.dimensions?.length || 0}{" "}
                          dimensions
                        </>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <ModelWizard opened={open} onClose={close} />
    </Stack>
  );
}
