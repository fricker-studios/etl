import {
  Group,
  Title,
  Text,
  Button,
  Stack,
  Card,
  Table,
  Badge,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useAppStore } from "../store/useAppStore";
import { ModelWizard } from "../features/models/ModelWizard";

export function ModelsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const models = useAppStore((s) => s.models);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Models</Title>
          <Text c="dimmed">
            Define semantic structure using Data Vault or Dimensional modeling.
          </Text>
        </div>
        <Button onClick={openIt}>New model</Button>
      </Group>

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
            {models.map((m: any) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.name}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{m.type}</Badge>
                </Table.Td>
                <Table.Td>{m.packages?.length ?? 0}</Table.Td>
              </Table.Tr>
            ))}
            {models.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">No models yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <ModelWizard opened={open} onClose={close} />
    </Stack>
  );
}
