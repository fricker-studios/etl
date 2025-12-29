import { Group, Title, Text, Button, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ConnectionCards } from "../features/connections/ConnectionCards";
import { ConnectionWizard } from "../features/connections/ConnectionWizard";

export function ConnectionsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Connections</Title>
          <Text c="dimmed">Configure your storage backends (destinations) like S3 or ClickHouse.</Text>
        </div>
        <Button onClick={openIt}>Add connection</Button>
      </Group>

      <ConnectionCards />
      <ConnectionWizard opened={open} onClose={close} />
    </Stack>
  );
}
