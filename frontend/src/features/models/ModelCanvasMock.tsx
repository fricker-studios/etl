import { Card, Group, Badge, Text, SimpleGrid, Stack } from "@mantine/core";
import { IconCircleFilled } from "@tabler/icons-react";

export function ModelCanvasMock({
  type,
}: {
  type: "data_vault" | "dimensional";
}) {
  if (type === "data_vault") {
    return (
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Group justify="space-between">
            <Text fw={700}>HubCustomer</Text>
            <Badge variant="light">Hub</Badge>
          </Group>
          <Text c="dimmed" size="sm" mt="sm">
            Business Key: customer_id
          </Text>
        </Card>
        <Card withBorder>
          <Group justify="space-between">
            <Text fw={700}>SatCustomerProfile</Text>
            <Badge variant="light">Satellite</Badge>
          </Group>
          <Text c="dimmed" size="sm" mt="sm">
            Attributes: email, created_at, segment
          </Text>
        </Card>
        <Card withBorder>
          <Group justify="space-between">
            <Text fw={700}>LinkCustomerOrder</Text>
            <Badge variant="light">Link</Badge>
          </Group>
          <Stack gap={4} mt="sm">
            <Group gap={6}>
              <IconCircleFilled size={10} />
              <Text size="sm">HubCustomer</Text>
            </Group>
            <Group gap={6}>
              <IconCircleFilled size={10} />
              <Text size="sm">HubOrder</Text>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder>
        <Group justify="space-between">
          <Text fw={700}>FactOrders</Text>
          <Badge variant="light">Fact</Badge>
        </Group>
        <Text c="dimmed" size="sm" mt="sm">
          Grain: order_id · Measures: revenue · Dims: customer, date
        </Text>
      </Card>
      <Card withBorder>
        <Group justify="space-between">
          <Text fw={700}>DimCustomer</Text>
          <Badge variant="light">Dimension</Badge>
        </Group>
        <Text c="dimmed" size="sm" mt="sm">
          Key: customer_id · Attributes: email, segment
        </Text>
      </Card>
    </SimpleGrid>
  );
}
