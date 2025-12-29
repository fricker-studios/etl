import { Card, Group, Text, Button, Badge, SimpleGrid, Stack } from "@mantine/core";
import { useAppStore } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";

export function ConnectionCards() {
  const { storageBackends, removeStorageBackend } = useAppStore();

  if (storageBackends.length === 0) {
    return (
      <Card withBorder>
        <Text fw={600}>No connections yet</Text>
        <Text c="dimmed" mt={6}>
          Add S3 to store raw “data packages”, or ClickHouse for fast analytics + modeling.
        </Text>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
      {storageBackends.map((b) => (
        <Card key={b.id} withBorder>
          <Stack gap={6}>
            <Group justify="space-between">
              <Text fw={700}>{b.name}</Text>
              <Badge variant="light">{b.kind.toUpperCase()}</Badge>
            </Group>

            {b.kind === "s3" ? (
              <>
                <Text size="sm" c="dimmed">{b.endpoint}</Text>
                <Text size="sm">Bucket: <Text span fw={600}>{b.bucket}</Text></Text>
                <Text size="sm" c="dimmed">Path-style: {String(b.pathStyle)} · TLS verify: {String(b.tlsVerify)}</Text>
              </>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  Mode: {b.mode} · Secure: {String(b.secure)}
                </Text>
                <Text size="sm">
                  Hosts: {b.hosts.map((h) => `${h.host}:${h.port}`).join(", ")}
                </Text>
                <Text size="sm">DB: <Text span fw={600}>{b.database}</Text></Text>
              </>
            )}

            <Group justify="flex-end" mt="sm">
              <Button
                color="red"
                variant="light"
                onClick={() => {
                  removeStorageBackend(b.id);
                  notifications.show({ message: "Connection removed", color: "red" });
                }}
              >
                Remove
              </Button>
            </Group>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
