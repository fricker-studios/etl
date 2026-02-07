import {
  Group,
  Title,
  Text,
  Button,
  Card,
  Stack,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconPlayerPlay } from "@tabler/icons-react";
import { useAppStore } from "../store/useAppStore";
import { StreamDrawer } from "../features/sources/StreamDrawer";
import { api } from "../utils/api";
import { notifications } from "@mantine/notifications";
import { useState } from "react";

export function StreamsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const { streams, dataSources } = useAppStore();
  const [executingStreams, setExecutingStreams] = useState<Set<string>>(new Set());

  const sourceName = (id: string) =>
    dataSources.find((s) => s.id === id)?.name ?? "Unknown";

  const executeStream = async (streamId: string) => {
    setExecutingStreams(prev => new Set(prev).add(streamId));
    
    try {
      const result: any = await api.streams.execute(streamId);
      notifications.show({
        message: `${result.packages_created || 0} data package(s) created`,
        color: "teal",
      });
    } catch (error: any) {
      notifications.show({
        message: error.message || "Failed to execute stream",
        color: "red",
      });
    } finally {
      setExecutingStreams(prev => {
        const next = new Set(prev);
        next.delete(streamId);
        return next;
      });
    }
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Streams</Title>
          <Text c="dimmed">
            Scheduled data extraction from sources to topics
          </Text>
        </div>
        <Button onClick={openIt} leftSection={<IconPlus size={16} />}>
          Add stream
        </Button>
      </Group>

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Data Source</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Schedule</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {streams.map((st) => (
              <Table.Tr key={st.id}>
                <Table.Td>{st.name}</Table.Td>
                <Table.Td>{sourceName(st.data_source)}</Table.Td>
                <Table.Td>
                  <Badge variant="light">
                    {dataSources.find(s => s.id === st.data_source)?.type?.toUpperCase() || "Unknown"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {st.schedule_enabled ? (
                    <Badge color="green" variant="light">
                      {st.schedule_cron || `Every ${st.schedule_interval_minutes}m`}
                    </Badge>
                  ) : (
                    <Badge variant="light">Manual</Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Tooltip label="Run Now">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => executeStream(st.id)}
                      loading={executingStreams.has(st.id)}
                    >
                      <IconPlayerPlay size={16} />
                    </ActionIcon>
                  </Tooltip>
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
