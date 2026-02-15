import {
  Card,
  Stack,
  Badge,
  Table,
  Text,
  Pagination,
  Group,
} from "@mantine/core";
import { useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { useRuns } from "../hooks/useRuns";

export function RunsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage] = useState(10);
  const { data, isLoading } = useRuns(currentPage, perPage);

  const runs = data?.results || [];
  const pagination = data?.pagination;

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
      <PageHeader
        title="Runs"
        description="Execution history for streams and pipelines"
      />

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
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">Loading...</Text>
                </Table.Td>
              </Table.Tr>
            ) : runs.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">
                    No runs yet. Create a stream and execute it to see run
                    history here.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              runs.map((r) => (
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
                  <Table.Td>
                    {r.rows_processed?.toLocaleString() || "—"}
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>

        {/* Pagination */}
        {pagination && pagination.total_pages > 1 && (
          <Group justify="center" mt="md">
            <Pagination
              total={pagination.total_pages}
              value={currentPage}
              onChange={setCurrentPage}
            />
          </Group>
        )}
      </Card>
    </Stack>
  );
}
