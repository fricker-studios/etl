import {
  Text,
  Card,
  Stack,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconPlayerPlay } from "@tabler/icons-react";
import type { Stream } from "../store/useAppStore";
import { StreamDrawer } from "../features/sources/StreamDrawer";
import { StreamDetailDrawer } from "../features/sources/StreamDetailDrawer";
import { PageHeader } from "../components/common/PageHeader";
import { useStreams, useExecuteStream } from "../hooks/useStreams";
import { useDataSources } from "../hooks/useDataSources";
import { useState } from "react";

export function StreamsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const [detailOpen, { open: openDetail, close: closeDetail }] =
    useDisclosure(false);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);

  const { data: streams = [], isLoading } = useStreams();
  const { data: dataSources = [] } = useDataSources();
  const executeStream = useExecuteStream();

  const sourceName = (id: string) =>
    dataSources.find((s) => s.id === id)?.name ?? "Unknown";

  const handleStreamClick = (stream: Stream) => {
    setSelectedStream(stream);
    openDetail();
  };

  const handleExecuteStream = async (
    streamId: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    executeStream.mutate(streamId);
  };

  return (
    <Stack>
      <PageHeader
        title="Streams"
        description="Scheduled data extraction from sources to topics"
        action={{
          label: "Add stream",
          onClick: openIt,
          icon: <IconPlus size={16} />,
        }}
      />

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
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">Loading...</Text>
                </Table.Td>
              </Table.Tr>
            ) : streams.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">No streams yet.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              streams.map((st) => (
                <Table.Tr
                  key={st.id}
                  onClick={() => handleStreamClick(st)}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td>{st.name}</Table.Td>
                  <Table.Td>{sourceName(st.data_source)}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">
                      {dataSources
                        .find((s) => s.id === st.data_source)
                        ?.type?.toUpperCase() || "Unknown"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {st.schedule_enabled ? (
                      <Badge color="green" variant="light">
                        {st.schedule_cron ||
                          `Every ${st.schedule_interval_minutes}m`}
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
                        onClick={(e) => handleExecuteStream(st.id, e)}
                        loading={
                          executeStream.isPending &&
                          executeStream.variables === st.id
                        }
                      >
                        <IconPlayerPlay size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <StreamDrawer opened={open} onClose={close} />
      <StreamDetailDrawer
        opened={detailOpen}
        onClose={closeDetail}
        stream={selectedStream}
      />
    </Stack>
  );
}
