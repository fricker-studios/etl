import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useAppStore } from "../store/useAppStore";
import { notifications } from "@mantine/notifications";

export function SettingsPage() {
  const resetAll = useAppStore((s) => s.resetAll);

  return (
    <Stack>
      <Title order={2}>Settings</Title>

      <Card withBorder>
        <Text fw={600}>Prototype controls</Text>
        <Text c="dimmed" mt={6}>
          Everything is local-only. Reset clears all saved data from localStorage.
        </Text>
        <Group mt="md">
          <Button
            color="red"
            variant="light"
            onClick={() => {
              resetAll();
              notifications.show({ message: "All local data cleared", color: "red" });
            }}
          >
            Reset all data
          </Button>
        </Group>
      </Card>
    </Stack>
  );
}
