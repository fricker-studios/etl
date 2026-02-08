import { Text, Card, Stack, Table } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import type { DataSource } from "../store/useAppStore";
import { DataSourceDrawer } from "../features/sources/DataSourceDrawer";
import { DataSourceDetailDrawer } from "../features/sources/DataSourceDetailDrawer";
import { PageHeader } from "../components/common/PageHeader";
import { useDataSources } from "../hooks/useDataSources";

export function DataSourcesPage() {
  const [open, { open: openDrawer, close }] = useDisclosure(false);
  const [detailOpen, { open: openDetail, close: closeDetail }] =
    useDisclosure(false);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const { data: dataSources = [], isLoading } = useDataSources();

  const handleRowClick = (source: DataSource) => {
    setSelectedSource(source);
    openDetail();
  };

  return (
    <Stack>
      <PageHeader
        title="Data Sources"
        description="Configure connections to APIs, databases, S3 buckets, SFTP servers, and more"
        action={{
          label: "Add Data Source",
          onClick: openDrawer,
          icon: <IconPlus size={16} />,
        }}
      />

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
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">Loading...</Text>
                </Table.Td>
              </Table.Tr>
            ) : dataSources.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed">No data sources yet.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              dataSources.map((s) => (
                <Table.Tr
                  key={s.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleRowClick(s)}
                >
                  <Table.Td>{s.name}</Table.Td>
                  <Table.Td>{s.type.toUpperCase()}</Table.Td>
                  <Table.Td>
                    {s.type === "api" && s.base_url}
                    {s.type === "database" &&
                      `${s.database_type} - ${s.host}:${s.port}`}
                    {s.type === "s3" && `s3://${s.s3_bucket}`}
                    {s.type === "sftp" && `${s.sftp_host}:${s.sftp_port}`}
                  </Table.Td>
                </Table.Tr>
              ))
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
