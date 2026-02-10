import {
  Card,
  Group,
  Text,
  Button,
  Badge,
  SimpleGrid,
  Stack,
  Collapse,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { S3FileNavigator } from "./S3FileNavigator";
import { useStorageBackends, useDeleteStorageBackend } from "../../hooks/useStorageBackends";

export function ConnectionCards() {
  const { data: storageBackends = [], isLoading } = useStorageBackends();
  const deleteStorageBackend = useDeleteStorageBackend();
  const [openNavigator, setOpenNavigator] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card withBorder>
        <Text c="dimmed">Loading...</Text>
      </Card>
    );
  }

  if (storageBackends.length === 0) {
    return (
      <Card withBorder>
        <Text fw={600}>No connections yet</Text>
        <Text c="dimmed" mt={6}>
          Add S3 to store raw “data packages”, or ClickHouse for fast analytics
          + modeling.
        </Text>
      </Card>
    );
  }

  return (
    <Stack>
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
                  <Text size="sm" c="dimmed">
                    {b.endpoint}
                  </Text>
                  <Text size="sm">
                    Bucket:{" "}
                    <Text span fw={600}>
                      {b.bucket}
                    </Text>
                  </Text>
                  <Text size="sm" c="dimmed">
                    Path-style: {String(b.path_style)} · TLS verify:{" "}
                    {String(b.tls_verify)}
                  </Text>
                </>
              ) : (
                <>
                  <Text size="sm" c="dimmed">
                    Mode: {b.mode} · Secure: {String(b.secure)}
                  </Text>
                  <Text size="sm">
                    Hosts: {b.hosts.map((h) => `${h.host}:${h.port}`).join(", ")}
                  </Text>
                  <Text size="sm">
                    DB:{" "}
                    <Text span fw={600}>
                      {b.database}
                    </Text>
                  </Text>
                </>
              )}

              <Group justify="flex-end" mt="sm">
                {b.kind === "s3" && (
                  <Button
                    variant="light"
                    onClick={() => setOpenNavigator(openNavigator === b.id ? null : b.id)}
                  >
                    {openNavigator === b.id ? "Hide Browser" : "Browse Files"}
                  </Button>
                )}
                <Button
                  color="red"
                  variant="light"
                  onClick={() => {
                    deleteStorageBackend.mutate(b.id);
                  }}
                >
                  Remove
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      {/* S3 File Navigator - shown below cards when a backend is selected */}
      {storageBackends.filter((b) => b.kind === "s3").map((b) => (
        <Collapse key={`navigator-${b.id}`} in={openNavigator === b.id}>
          {openNavigator === b.id && (
            <S3FileNavigator storageBackendId={b.id} bucket={b.bucket} />
          )}
        </Collapse>
      ))}
    </Stack>
  );
}
