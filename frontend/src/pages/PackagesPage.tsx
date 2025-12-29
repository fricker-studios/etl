import { Badge, Button, Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useAppStore } from "../store/useAppStore";
import { PackageDrawer } from "../features/packages/PackageDrawer";

export function PackagesPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const { packages, streams } = useAppStore();

  const streamName = (id: string) => streams.find((s) => s.id === id)?.name ?? "Unknown";

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Data Packages</Title>
          <Text c="dimmed">A package is a captured dataset produced by a stream and stored in a destination.</Text>
        </div>
        <Button onClick={openIt} disabled={streams.length === 0}>
          New package
        </Button>
      </Group>

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Stream</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {packages.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>{streamName(p.streamId)}</Table.Td>
                <Table.Td>{new Date(p.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={p.status === "materialized" ? "teal" : p.status === "failed" ? "red" : "gray"}
                  >
                    {p.status}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
            {packages.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed">No packages yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <PackageDrawer opened={open} onClose={close} />
    </Stack>
  );
}
