import { Button, Stack, Tabs, Card, Text, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useAppStore } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { ConnectionCards } from "../features/connections/ConnectionCards";
import { ConnectionWizard } from "../features/connections/ConnectionWizard";
import { PageHeader } from "../components/common/PageHeader";

export function SettingsPage() {
  const [open, { open: openIt, close }] = useDisclosure(false);
  const resetAll = useAppStore((s) => s.resetAll);

  return (
    <Stack>
      <PageHeader
        title="Settings"
        description="Application configuration and storage backends"
      />

      <Tabs defaultValue="storage">
        <Tabs.List>
          <Tabs.Tab value="storage">Storage</Tabs.Tab>
          <Tabs.Tab value="general">General</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="storage" pt="lg">
          <Stack>
            <Group justify="space-between">
              <Text>
                Configure S3 and ClickHouse backends for application storage
              </Text>
              <Button onClick={openIt} leftSection={<IconPlus size={16} />}>
                Add Storage Backend
              </Button>
            </Group>
            <ConnectionCards />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="general" pt="lg">
          <Card withBorder>
            <Text fw={600}>Danger Zone</Text>
            <Text c="dimmed" mt={6}>
              Reset all data (for development purposes)
            </Text>
            <Group mt="md">
              <Button
                color="red"
                variant="light"
                onClick={() => {
                  if (
                    confirm("Are you sure? This will delete all your data.")
                  ) {
                    resetAll();
                    notifications.show({
                      message: "All data cleared",
                      color: "red",
                    });
                  }
                }}
              >
                Reset all data
              </Button>
            </Group>
          </Card>
        </Tabs.Panel>
      </Tabs>

      <ConnectionWizard opened={open} onClose={close} />
    </Stack>
  );
}
