import {
  Stack,
  Card,
  Table,
  Badge,
  Text,
} from "@mantine/core";
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
              <Table.Th>Packages</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">Loading...</Text>
                </Table.Td>
              </Table.Tr>
            ) : models.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">No models yet.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              models.map((m: any) => (
                <Table.Tr key={m.id}>
                  <Table.Td>{m.name}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{m.type}</Badge>
                  </Table.Td>
                  <Table.Td>{m.packages?.length ?? 0}</Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <ModelWizard opened={open} onClose={close} />
    </Stack>
  );
}
