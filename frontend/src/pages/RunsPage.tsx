import { Card, Group, Title, Text, Stack, Badge, Table } from "@mantine/core";
import { useAppStore } from "../store/useAppStore";

export function RunsPage() {
  const runs = useAppStore((s) => s.runs);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "—";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Runs</Title>
          <Text c="dimmed">Execution history for streams and pipelines</Text>
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
              <Table.Th>Rows</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {runs.map((r) => (
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
                          : r.status === "running"
                            ? "blue"
                            : "gray"
                    }
                  >
                    {r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatDate(r.started_at)}</Table.Td>
                <Table.Td>{formatDuration(r.duration_seconds)}</Table.Td>
                <Table.Td>{r.rows_processed?.toLocaleString() || "—"}</Table.Td>
              </Table.Tr>
            ))}
            {runs.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">No runs yet. Create a stream and execute it to see run history here.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
