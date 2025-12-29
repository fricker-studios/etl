import { Card, Group, Title, Text, Stack, Badge, Table } from "@mantine/core";

const mockRuns = [
  {
    id: "r1",
    name: "Daily snapshot",
    status: "success",
    started: "2025-12-28 02:00",
    duration: "38s",
  },
  {
    id: "r2",
    name: "Backfill customers",
    status: "running",
    started: "2025-12-28 12:10",
    duration: "—",
  },
  {
    id: "r3",
    name: "Orders sync",
    status: "failed",
    started: "2025-12-27 02:00",
    duration: "12s",
  },
];

export function RunsPage() {
  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Runs</Title>
          <Text c="dimmed">Execution history UI (mocked).</Text>
        </div>
      </Group>

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Duration</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {mockRuns.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.name}</Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={
                      r.status === "success"
                        ? "teal"
                        : r.status === "failed"
                          ? "red"
                          : "blue"
                    }
                  >
                    {r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{r.started}</Table.Td>
                <Table.Td>{r.duration}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
