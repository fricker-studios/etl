import { Stack, Card, Table, Badge, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { PageHeader } from "../components/common/PageHeader";
import { useModels } from "../hooks/useModels";
import { useNavigate } from "react-router-dom";

export function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const navigate = useNavigate();

  return (
    <Stack>
      <PageHeader
        title="Models"
        description="Define semantic structure using Data Vault or Dimensional modeling."
        action={{
          label: "New model",
          onClick: () => navigate("/models/new"),
          icon: <IconPlus size={16} />,
        }}
      />

      <Card withBorder>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Model Type</Table.Th>
              <Table.Th>Entity Type</Table.Th>
              <Table.Th>Topic</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed">Loading...</Text>
                </Table.Td>
              </Table.Tr>
            ) : models.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed">No models yet.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              models.map((m: any) => {
                let entityType = "";
                if (m.type === "data_vault") {
                  if (m.hubs?.length > 0) entityType = "Hub";
                  else if (m.links?.length > 0) entityType = "Link";
                  else if (m.satellites?.length > 0) entityType = "Satellite";
                } else {
                  if (m.facts?.length > 0) entityType = "Fact";
                  else if (m.dimensions?.length > 0) entityType = "Dimension";
                }

                return (
                  <Table.Tr 
                    key={m.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/models/${m.id}`)}
                  >
                    <Table.Td>{m.name}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">
                        {m.type === "data_vault" ? "Data Vault" : "Dimensional"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {entityType ? (
                        <Badge size="sm" variant="outline">
                          {entityType}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{m.topics?.length ?? 0} topic(s)</Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
