import {
  Modal,
  Stepper,
  Group,
  Button,
  TextInput,
  Switch,
  Select,
  Stack,
  NumberInput,
  SimpleGrid,
  Divider,
} from "@mantine/core";
import { useState } from "react";
import { z } from "zod";
import { notifications } from "@mantine/notifications";
import { useAppStore } from "../../store/useAppStore";

type Props = { opened: boolean; onClose: () => void };

export function ConnectionWizard({ opened, onClose }: Props) {
  const add = useAppStore((s) => s.addStorageBackend);
  const [active, setActive] = useState(0);

  const [kind, setKind] = useState<"s3" | "clickhouse">("s3");

  // S3
  const [s3, setS3] = useState({
    name: "S3 Destination",
    endpoint: "https://s3.example.com",
    region: "default",
    bucket: "etl-raw",
    accessKeyId: "",
    secretAccessKey: "",
    pathStyle: true,
    tlsVerify: true,
  });

  // ClickHouse
  const [ch, setCh] = useState({
    name: "ClickHouse Destination",
    mode: "single" as "single" | "cluster",
    hosts: [{ host: "clickhouse.local", port: 8123 }],
    database: "etl",
    username: "default",
    password: "",
    secure: false,
  });

  const validate = () => {
    if (kind === "s3") {
      const schema = z.object({
        name: z.string().min(2),
        endpoint: z.string().url(),
        bucket: z.string().min(1),
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
      });
      schema.parse(s3);
    } else {
      const schema = z.object({
        name: z.string().min(2),
        hosts: z.array(z.object({ host: z.string().min(1), port: z.number().int().min(1) })).min(1),
        database: z.string().min(1),
        username: z.string().min(1),
      });
      schema.parse(ch);
    }
  };

  const next = () => setActive((a) => Math.min(a + 1, 2));
  const back = () => setActive((a) => Math.max(a - 1, 0));

  const save = () => {
    try {
      validate();
      if (kind === "s3") add({ kind: "s3", ...s3 });
      else add({ kind: "clickhouse", ...ch });
      notifications.show({ message: "Connection saved", color: "teal" });
      setActive(0);
      onClose();
    } catch (e: any) {
      notifications.show({ message: e?.message ?? "Validation error", color: "red" });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add connection" size="lg">
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label="Type">
          <Stack>
            <Select
              label="Destination type"
              value={kind}
              onChange={(v) => setKind((v as any) ?? "s3")}
              data={[
                { value: "s3", label: "S3-compatible (raw packages)" },
                { value: "clickhouse", label: "ClickHouse (analytics + modeling)" },
              ]}
            />
            <Divider />
            <Group justify="flex-end">
              <Button onClick={next}>Next</Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Configure">
          {kind === "s3" ? (
            <Stack>
              <TextInput label="Name" value={s3.name} onChange={(e) => setS3({ ...s3, name: e.target.value })} />
              <TextInput
                label="Endpoint"
                value={s3.endpoint}
                onChange={(e) => setS3({ ...s3, endpoint: e.target.value })}
                description="Supports AWS S3, MinIO, Ceph RGW (path-style often required)"
              />
              <SimpleGrid cols={2}>
                <TextInput label="Region" value={s3.region} onChange={(e) => setS3({ ...s3, region: e.target.value })} />
                <TextInput label="Bucket" value={s3.bucket} onChange={(e) => setS3({ ...s3, bucket: e.target.value })} />
              </SimpleGrid>
              <SimpleGrid cols={2}>
                <TextInput
                  label="Access Key ID"
                  value={s3.accessKeyId}
                  onChange={(e) => setS3({ ...s3, accessKeyId: e.target.value })}
                />
                <TextInput
                  label="Secret Access Key"
                  type="password"
                  value={s3.secretAccessKey}
                  onChange={(e) => setS3({ ...s3, secretAccessKey: e.target.value })}
                />
              </SimpleGrid>
              <Group>
                <Switch
                  label="Path-style addressing"
                  checked={s3.pathStyle}
                  onChange={(e) => setS3({ ...s3, pathStyle: e.currentTarget.checked })}
                />
                <Switch
                  label="Verify TLS certificates"
                  checked={s3.tlsVerify}
                  onChange={(e) => setS3({ ...s3, tlsVerify: e.currentTarget.checked })}
                />
              </Group>
              <Group justify="space-between">
                <Button variant="light" onClick={back}>Back</Button>
                <Button onClick={next}>Next</Button>
              </Group>
            </Stack>
          ) : (
            <Stack>
              <TextInput label="Name" value={ch.name} onChange={(e) => setCh({ ...ch, name: e.target.value })} />
              <Select
                label="Mode"
                value={ch.mode}
                onChange={(v) => setCh({ ...ch, mode: (v as any) ?? "single" })}
                data={[
                  { value: "single", label: "Single node" },
                  { value: "cluster", label: "Cluster (multiple hosts)" },
                ]}
              />
              {ch.hosts.map((h, idx) => (
                <SimpleGrid key={idx} cols={2}>
                  <TextInput
                    label={idx === 0 ? "Host(s)" : undefined}
                    value={h.host}
                    onChange={(e) => {
                      const hosts = ch.hosts.slice();
                      hosts[idx] = { ...hosts[idx], host: e.target.value };
                      setCh({ ...ch, hosts });
                    }}
                  />
                  <NumberInput
                    label={idx === 0 ? "Port" : undefined}
                    value={h.port}
                    onChange={(v) => {
                      const hosts = ch.hosts.slice();
                      hosts[idx] = { ...hosts[idx], port: Number(v ?? 8123) };
                      setCh({ ...ch, hosts });
                    }}
                    min={1}
                  />
                </SimpleGrid>
              ))}
              <Group>
                <Button
                  variant="light"
                  onClick={() => setCh({ ...ch, hosts: [...ch.hosts, { host: "", port: 8123 }] })}
                >
                  Add host
                </Button>
                {ch.hosts.length > 1 && (
                  <Button
                    variant="light"
                    color="red"
                    onClick={() => setCh({ ...ch, hosts: ch.hosts.slice(0, -1) })}
                  >
                    Remove last
                  </Button>
                )}
              </Group>
              <SimpleGrid cols={2}>
                <TextInput label="Database" value={ch.database} onChange={(e) => setCh({ ...ch, database: e.target.value })} />
                <Switch label="Secure (HTTPS)" checked={ch.secure} onChange={(e) => setCh({ ...ch, secure: e.currentTarget.checked })} />
              </SimpleGrid>
              <SimpleGrid cols={2}>
                <TextInput label="Username" value={ch.username} onChange={(e) => setCh({ ...ch, username: e.target.value })} />
                <TextInput label="Password" type="password" value={ch.password} onChange={(e) => setCh({ ...ch, password: e.target.value })} />
              </SimpleGrid>
              <Group justify="space-between">
                <Button variant="light" onClick={back}>Back</Button>
                <Button onClick={next}>Next</Button>
              </Group>
            </Stack>
          )}
        </Stepper.Step>

        <Stepper.Step label="Review">
          <Stack>
            <Divider label="Summary" />
            <pre style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>
              {JSON.stringify(kind === "s3" ? { kind, ...s3 } : { kind, ...ch }, null, 2)}
            </pre>
            <Group justify="space-between">
              <Button variant="light" onClick={back}>Back</Button>
              <Button onClick={save}>Save connection</Button>
            </Group>
          </Stack>
        </Stepper.Step>
      </Stepper>
    </Modal>
  );
}
