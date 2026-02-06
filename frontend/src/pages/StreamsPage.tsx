import {
  Group,
  Title,
  Text,
  Button,
  Card,
  Stack,
  Table,
  Badge,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useAppStore } from "../store/useAppStore";
import { StreamDrawer } from "../features/sources/StreamDrawer";

export function StreamsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const { streams, apiSources } = useAppStore();

  const sourceName = (id: string) =>
    apiSources.find((s) => s.id === id)?.name ?? "Unknown";

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Streams</Title>
          <Text c="dimmed">
            Streams are API endpoints + request config. Add a preview JSON to
            infer schema.
          </Text>
        </div>
        <Button onClick={openIt}>Add stream</Button>
      </Group>

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>API Source</Table.Th>
              <Table.Th>Method</Table.Th>
              <Table.Th>Path</Table.Th>
              <Table.Th>Schema</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {streams.map((st) => (
              <Table.Tr key={st.id}>
                <Table.Td>{st.name}</Table.Td>
                <Table.Td>{sourceName(st.api_source)}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{st.method}</Badge>
                </Table.Td>
                <Table.Td>{st.path}</Table.Td>
                <Table.Td>
                  {st.inferred_schema ? (
                    <Badge color="teal" variant="light">
                      Inferred
                    </Badge>
                  ) : (
                    <Badge variant="light">Missing</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {streams.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">No streams yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <StreamDrawer opened={open} onClose={close} />
    </Stack>
  );
}
