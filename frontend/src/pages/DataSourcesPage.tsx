import { Group, Title, Text, Card, Stack, Table } from "@mantine/core";
import { useAppStore } from "../store/useAppStore";

export function DataSourcesPage() {
  const dataSources = useAppStore((s) => s.dataSources);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Data Sources</Title>
          <Text c="dimmed">
            Configure connections to APIs, databases, S3 buckets, SFTP servers, and more
          </Text>
        </div>
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
              <Table.Tr key={s.id}>
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

      {/* TODO: Add DataSourceDrawer component */}
    </Stack>
  );
}
