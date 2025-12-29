import {
  Drawer,
  Stack,
  TextInput,
  Select,
  SimpleGrid,
  Button,
  Group,
  Divider,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { z } from "zod";

export function ApiSourceDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const upsert = useAppStore((s) => s.upsertApiSource);

  const [form, setForm] = useState({
    name: "My API",
    baseUrl: "https://api.example.com",
    authType: "bearer" as "none" | "bearer" | "basic" | "header",
    bearerToken: "",
    basicUser: "",
    basicPass: "",
    headerName: "X-API-Key",
    headerValue: "",
  });

  const save = () => {
    try {
      z.object({
        name: z.string().min(2),
        baseUrl: z.string().url(),
        authType: z.enum(["none", "bearer", "basic", "header"]),
      }).parse(form);

      if (form.authType === "bearer") z.string().min(1).parse(form.bearerToken);
      if (form.authType === "basic") {
        z.string().min(1).parse(form.basicUser);
        z.string().min(1).parse(form.basicPass);
      }
      if (form.authType === "header") {
        z.string().min(1).parse(form.headerName);
        z.string().min(1).parse(form.headerValue);
      }

      upsert(form);
      notifications.show({ message: "API source saved", color: "teal" });
      onClose();
    } catch (e: any) {
      notifications.show({ message: e?.message ?? "Validation error", color: "red" });
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title="Add API source" position="right" size="lg">
      <Stack>
        <TextInput label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextInput
          label="Base URL"
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          description="Root URL used by streams; streams supply relative paths."
        />

        <Select
          label="Auth type"
          value={form.authType}
          onChange={(v) => setForm({ ...form, authType: (v as any) ?? "none" })}
          data={[
            { value: "none", label: "None" },
            { value: "bearer", label: "Bearer token" },
            { value: "basic", label: "Basic auth" },
            { value: "header", label: "Custom header" },
          ]}
        />

        {form.authType === "bearer" && (
          <TextInput
            label="Bearer token"
            value={form.bearerToken}
            onChange={(e) => setForm({ ...form, bearerToken: e.target.value })}
          />
        )}

        {form.authType === "basic" && (
          <SimpleGrid cols={2}>
            <TextInput label="Username" value={form.basicUser} onChange={(e) => setForm({ ...form, basicUser: e.target.value })} />
            <TextInput label="Password" type="password" value={form.basicPass} onChange={(e) => setForm({ ...form, basicPass: e.target.value })} />
          </SimpleGrid>
        )}

        {form.authType === "header" && (
          <SimpleGrid cols={2}>
            <TextInput label="Header name" value={form.headerName} onChange={(e) => setForm({ ...form, headerName: e.target.value })} />
            <TextInput label="Header value" value={form.headerValue} onChange={(e) => setForm({ ...form, headerValue: e.target.value })} />
          </SimpleGrid>
        )}

        <Divider />
        <Text c="dimmed" size="sm">
          This frontend does not call external APIs; preview JSON is provided manually or via the mock generator in Streams.
        </Text>

        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
