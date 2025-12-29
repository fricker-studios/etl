import { Group, Title, Text, Button, Card, Stack, Table } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useAppStore } from "../store/useAppStore";
import { ApiSourceDrawer } from "../features/sources/ApiSourceDrawer";

export function ApiSourcesPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const apiSources = useAppStore((s) => s.apiSources);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>API Sources</Title>
          <Text c="dimmed">Define root URLs + credentials. Streams reference these sources.</Text>
        </div>
        <Button onClick={openIt}>Add API source</Button>
      </Group>

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Base URL</Table.Th>
              <Table.Th>Auth</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {apiSources.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.name}</Table.Td>
                <Table.Td>{s.baseUrl}</Table.Td>
                <Table.Td>{s.authType}</Table.Td>
              </Table.Tr>
            ))}
            {apiSources.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">No API sources yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <ApiSourceDrawer opened={open} onClose={close} />
    </Stack>
  );
}
