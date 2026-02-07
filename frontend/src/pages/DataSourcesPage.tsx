import { useEffect } from "react";
import { Group, Title, Text, Card, Stack, Table, Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { useAppStore, type DataSource } from "../store/useAppStore";
import { DataSourceDrawer } from "../features/sources/DataSourceDrawer";
import { DataSourceDetailDrawer } from "../features/sources/DataSourceDetailDrawer";

export function DataSourcesPage() {
  const [open, { open: openDrawer, close }] = useDisclosure(false);
  const [detailOpen, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const dataSources = useAppStore((s) => s.dataSources);
  const fetchAll = useAppStore((s) => s.fetchAll);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRowClick = (source: DataSource) => {
    setSelectedSource(source);
    openDetail();
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Data Sources</Title>
          <Text c="dimmed">
            Configure connections to APIs, databases, S3 buckets, SFTP servers, and more
          </Text>
        </div>
        <Button onClick={openDrawer}>Add Data Source</Button>
      </Group>

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Details</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dataSources.map((s) => (
              <Table.Tr
                key={s.id}
                style={{ cursor: "pointer" }}
                onClick={() => handleRowClick(s)}
              >
                <Table.Td>{s.name}</Table.Td>
                <Table.Td>{s.type.toUpperCase()}</Table.Td>
                <Table.Td>
                  {s.type === 'api' && s.base_url}
                  {s.type === 'database' && `${s.database_type} - ${s.host}:${s.port}`}
                  {s.type === 's3' && `s3://${s.s3_bucket}`}
                  {s.type === 'sftp' && `${s.sftp_host}:${s.sftp_port}`}
                </Table.Td>
              </Table.Tr>
            ))}
            {dataSources.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">No data sources yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <DataSourceDrawer opened={open} onClose={close} />
      <DataSourceDetailDrawer
        opened={detailOpen}
        onClose={closeDetail}
        dataSource={selectedSource}
      />
    </Stack>
  );
}
