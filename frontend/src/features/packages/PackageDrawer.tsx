import {
  Drawer,
  Stack,
  TextInput,
  Select,
  Button,
  Group,
  Divider,
  Text,
  Badge,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";

export function PackageDrawer({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { streams, storageBackends, addPackage, updatePackage } = useAppStore();

  const streamOptions = streams.map((s) => ({ value: s.id, label: s.name }));
  const destOptions = storageBackends.map((d) => ({
    value: d.id,
    label: `${d.name} (${d.kind})`,
  }));

  const [name, setName] = useState("Daily snapshot");
  const [streamId, setStreamId] = useState(streamOptions[0]?.value ?? "");
  const [destinationId, setDestinationId] = useState(
    destOptions[0]?.value ?? "",
  );

  const stream = useMemo(
    () => streams.find((s) => s.id === streamId),
    [streams, streamId],
  );

  const create = () => {
    addPackage({
      name,
      streamId,
      destinationId,
      rowCountEstimate: Math.floor(1000 + Math.random() * 5000),
    });
    const created = useAppStore.getState().packages.slice().reverse()[0];

    // simulate a run without backend
    updatePackage(created.id, { status: "queued" });
    notifications.show({
      message: "Package queued (simulated)",
      color: "blue",
    });

    setTimeout(() => {
      const ok = Math.random() > 0.15;
      updatePackage(created.id, { status: ok ? "materialized" : "failed" });
      notifications.show({
        message: ok ? "Package materialized" : "Package failed",
        color: ok ? "teal" : "red",
      });
    }, 650);

    onClose();
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="New data package"
      position="right"
      size="lg"
    >
      <Stack>
        <TextInput
          label="Package name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label="Stream"
          data={streamOptions}
          value={streamId}
          onChange={(v) => setStreamId((v as any) ?? "")}
        />
        <Select
          label="Destination"
          data={destOptions}
          value={destinationId}
          onChange={(v) => setDestinationId((v as any) ?? "")}
          description="Where raw extracted data would be stored."
        />

        <Divider />
        <Badge variant="light">Schema readiness</Badge>
        <Text c="dimmed" size="sm">
          {stream?.inferredSchema
            ? "Schema inferred from preview JSON."
            : "No inferred schema yet. Add a stream preview first."}
        </Text>

        <Group justify="flex-end" mt="sm">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!streamId || !destinationId}>
            Create
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
