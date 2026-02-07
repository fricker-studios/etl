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
  PasswordInput,
  Tabs,
  NumberInput,
  Textarea,
} from "@mantine/core";
import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { z } from "zod";

type DataSourceType = "api" | "database" | "s3" | "sftp";

export function DataSourceDrawer({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const upsert = useAppStore((s) => s.upsertDataSource);

  const [type, setType] = useState<DataSourceType>("api");
  const [apiForm, setApiForm] = useState({
    name: "",
    base_url: "",
    auth_type: "none" as "none" | "bearer" | "basic" | "header",
    bearer_token: "",
    basic_user: "",
    basic_pass: "",
    header_name: "",
    header_value: "",
  });

  const [dbForm, setDbForm] = useState({
    name: "",
    database_type: "postgresql" as
      | "postgresql"
      | "mysql"
      | "mongodb"
      | "sqlserver"
      | "oracle",
    host: "",
    port: 5432,
    database_name: "",
    username: "",
    password: "",
  });

  const [s3Form, setS3Form] = useState({
    name: "",
    s3_endpoint: "",
    s3_region: "us-east-1",
    s3_bucket: "",
    s3_access_key: "",
    s3_secret_key: "",
  });

  const [sftpForm, setSftpForm] = useState({
    name: "",
    sftp_host: "",
    sftp_port: 22,
    sftp_username: "",
    sftp_password: "",
    sftp_key: "",
  });

  const save = () => {
    try {
      let payload: any = { type };

      if (type === "api") {
        z.object({
          name: z.string().min(2, "Name must be at least 2 characters"),
          base_url: z.string().url("Must be a valid URL"),
          auth_type: z.enum(["none", "bearer", "basic", "header"]),
        }).parse(apiForm);

        if (apiForm.auth_type === "bearer" && !apiForm.bearer_token) {
          throw new Error("Bearer token is required");
        }
        if (
          apiForm.auth_type === "basic" &&
          (!apiForm.basic_user || !apiForm.basic_pass)
        ) {
          throw new Error("Username and password are required for basic auth");
        }
        if (
          apiForm.auth_type === "header" &&
          (!apiForm.header_name || !apiForm.header_value)
        ) {
          throw new Error("Header name and value are required");
        }

        payload = { ...payload, ...apiForm };
      } else if (type === "database") {
        z.object({
          name: z.string().min(2),
          database_type: z.enum([
            "postgresql",
            "mysql",
            "mongodb",
            "sqlserver",
            "oracle",
          ]),
          host: z.string().min(1, "Host is required"),
          port: z.number().min(1).max(65535),
          database_name: z.string().min(1, "Database name is required"),
          username: z.string().min(1, "Username is required"),
          password: z.string().min(1, "Password is required"),
        }).parse(dbForm);

        payload = { ...payload, ...dbForm };
      } else if (type === "s3") {
        z.object({
          name: z.string().min(2),
          s3_bucket: z.string().min(1, "Bucket name is required"),
          s3_access_key: z.string().min(1, "Access key is required"),
          s3_secret_key: z.string().min(1, "Secret key is required"),
        }).parse(s3Form);

        payload = { ...payload, ...s3Form };
      } else if (type === "sftp") {
        z.object({
          name: z.string().min(2),
          sftp_host: z.string().min(1, "Host is required"),
          sftp_port: z.number().min(1).max(65535),
          sftp_username: z.string().min(1, "Username is required"),
        }).parse(sftpForm);

        if (!sftpForm.sftp_password && !sftpForm.sftp_key) {
          throw new Error("Either password or SSH key is required");
        }

        payload = { ...payload, ...sftpForm };
      }

      upsert(payload);
      notifications.show({ message: "Data source saved", color: "teal" });
      onClose();

      // Reset forms
      setApiForm({
        name: "",
        base_url: "",
        auth_type: "none",
        bearer_token: "",
        basic_user: "",
        basic_pass: "",
        header_name: "",
        header_value: "",
      });
      setDbForm({
        name: "",
        database_type: "postgresql",
        host: "",
        port: 5432,
        database_name: "",
        username: "",
        password: "",
      });
      setS3Form({
        name: "",
        s3_endpoint: "",
        s3_region: "us-east-1",
        s3_bucket: "",
        s3_access_key: "",
        s3_secret_key: "",
      });
      setSftpForm({
        name: "",
        sftp_host: "",
        sftp_port: 22,
        sftp_username: "",
        sftp_password: "",
        sftp_key: "",
      });
    } catch (e: any) {
      notifications.show({
        message: e?.message ?? "Validation error",
        color: "red",
      });
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Add Data Source"
      position="right"
      size="lg"
    >
      <Stack>
        <Select
          label="Data Source Type"
          value={type}
          onChange={(v) => setType((v as DataSourceType) ?? "api")}
          data={[
            { value: "api", label: "API / REST Endpoint" },
            { value: "database", label: "Database (SQL/NoSQL)" },
            { value: "s3", label: "S3 Bucket" },
            { value: "sftp", label: "SFTP Server" },
          ]}
        />

        <Divider />

        <Tabs
          value={type}
          onChange={(v) => setType((v as DataSourceType) ?? "api")}
        >
          <Tabs.Panel value="api">
            <Stack>
              <TextInput
                label="Name"
                placeholder="My API"
                value={apiForm.name}
                onChange={(e) =>
                  setApiForm({ ...apiForm, name: e.target.value })
                }
                required
              />
              <TextInput
                label="Base URL"
                placeholder="https://api.example.com"
                value={apiForm.base_url}
                onChange={(e) =>
                  setApiForm({ ...apiForm, base_url: e.target.value })
                }
                description="Root URL for API requests"
                required
              />

              <Select
                label="Authentication"
                value={apiForm.auth_type}
                onChange={(v) =>
                  setApiForm({ ...apiForm, auth_type: (v as any) ?? "none" })
                }
                data={[
                  { value: "none", label: "None" },
                  { value: "bearer", label: "Bearer Token" },
                  { value: "basic", label: "Basic Auth" },
                  { value: "header", label: "Custom Header" },
                ]}
              />

              {apiForm.auth_type === "bearer" && (
                <PasswordInput
                  label="Bearer Token"
                  placeholder="Your API token"
                  value={apiForm.bearer_token}
                  onChange={(e) =>
                    setApiForm({ ...apiForm, bearer_token: e.target.value })
                  }
                  required
                />
              )}

              {apiForm.auth_type === "basic" && (
                <SimpleGrid cols={2}>
                  <TextInput
                    label="Username"
                    value={apiForm.basic_user}
                    onChange={(e) =>
                      setApiForm({ ...apiForm, basic_user: e.target.value })
                    }
                    required
                  />
                  <PasswordInput
                    label="Password"
                    value={apiForm.basic_pass}
                    onChange={(e) =>
                      setApiForm({ ...apiForm, basic_pass: e.target.value })
                    }
                    required
                  />
                </SimpleGrid>
              )}

              {apiForm.auth_type === "header" && (
                <SimpleGrid cols={2}>
                  <TextInput
                    label="Header Name"
                    placeholder="X-API-Key"
                    value={apiForm.header_name}
                    onChange={(e) =>
                      setApiForm({ ...apiForm, header_name: e.target.value })
                    }
                    required
                  />
                  <PasswordInput
                    label="Header Value"
                    value={apiForm.header_value}
                    onChange={(e) =>
                      setApiForm({ ...apiForm, header_value: e.target.value })
                    }
                    required
                  />
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="database">
            <Stack>
              <TextInput
                label="Name"
                placeholder="My Database"
                value={dbForm.name}
                onChange={(e) => setDbForm({ ...dbForm, name: e.target.value })}
                required
              />
              <Select
                label="Database Type"
                value={dbForm.database_type}
                onChange={(v) =>
                  setDbForm({
                    ...dbForm,
                    database_type: (v as any) ?? "postgresql",
                  })
                }
                data={[
                  { value: "postgresql", label: "PostgreSQL" },
                  { value: "mysql", label: "MySQL" },
                  { value: "mongodb", label: "MongoDB" },
                  { value: "sqlserver", label: "SQL Server" },
                  { value: "oracle", label: "Oracle" },
                ]}
              />
              <SimpleGrid cols={2}>
                <TextInput
                  label="Host"
                  placeholder="localhost"
                  value={dbForm.host}
                  onChange={(e) =>
                    setDbForm({ ...dbForm, host: e.target.value })
                  }
                  required
                />
                <NumberInput
                  label="Port"
                  value={dbForm.port}
                  onChange={(v) =>
                    setDbForm({ ...dbForm, port: Number(v) || 5432 })
                  }
                  min={1}
                  max={65535}
                  required
                />
              </SimpleGrid>
              <TextInput
                label="Database Name"
                value={dbForm.database_name}
                onChange={(e) =>
                  setDbForm({ ...dbForm, database_name: e.target.value })
                }
                required
              />
              <SimpleGrid cols={2}>
                <TextInput
                  label="Username"
                  value={dbForm.username}
                  onChange={(e) =>
                    setDbForm({ ...dbForm, username: e.target.value })
                  }
                  required
                />
                <PasswordInput
                  label="Password"
                  value={dbForm.password}
                  onChange={(e) =>
                    setDbForm({ ...dbForm, password: e.target.value })
                  }
                  required
                />
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="s3">
            <Stack>
              <TextInput
                label="Name"
                placeholder="My S3 Bucket"
                value={s3Form.name}
                onChange={(e) => setS3Form({ ...s3Form, name: e.target.value })}
                required
              />
              <TextInput
                label="Endpoint (optional)"
                placeholder="https://s3.amazonaws.com"
                value={s3Form.s3_endpoint}
                onChange={(e) =>
                  setS3Form({ ...s3Form, s3_endpoint: e.target.value })
                }
                description="Leave blank for AWS S3"
              />
              <SimpleGrid cols={2}>
                <TextInput
                  label="Region"
                  placeholder="us-east-1"
                  value={s3Form.s3_region}
                  onChange={(e) =>
                    setS3Form({ ...s3Form, s3_region: e.target.value })
                  }
                />
                <TextInput
                  label="Bucket Name"
                  placeholder="my-bucket"
                  value={s3Form.s3_bucket}
                  onChange={(e) =>
                    setS3Form({ ...s3Form, s3_bucket: e.target.value })
                  }
                  required
                />
              </SimpleGrid>
              <TextInput
                label="Access Key ID"
                value={s3Form.s3_access_key}
                onChange={(e) =>
                  setS3Form({ ...s3Form, s3_access_key: e.target.value })
                }
                required
              />
              <PasswordInput
                label="Secret Access Key"
                value={s3Form.s3_secret_key}
                onChange={(e) =>
                  setS3Form({ ...s3Form, s3_secret_key: e.target.value })
                }
                required
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="sftp">
            <Stack>
              <TextInput
                label="Name"
                placeholder="My SFTP Server"
                value={sftpForm.name}
                onChange={(e) =>
                  setSftpForm({ ...sftpForm, name: e.target.value })
                }
                required
              />
              <SimpleGrid cols={2}>
                <TextInput
                  label="Host"
                  placeholder="sftp.example.com"
                  value={sftpForm.sftp_host}
                  onChange={(e) =>
                    setSftpForm({ ...sftpForm, sftp_host: e.target.value })
                  }
                  required
                />
                <NumberInput
                  label="Port"
                  value={sftpForm.sftp_port}
                  onChange={(v) =>
                    setSftpForm({ ...sftpForm, sftp_port: Number(v) || 22 })
                  }
                  min={1}
                  max={65535}
                  required
                />
              </SimpleGrid>
              <TextInput
                label="Username"
                value={sftpForm.sftp_username}
                onChange={(e) =>
                  setSftpForm({ ...sftpForm, sftp_username: e.target.value })
                }
                required
              />
              <PasswordInput
                label="Password"
                value={sftpForm.sftp_password}
                onChange={(e) =>
                  setSftpForm({ ...sftpForm, sftp_password: e.target.value })
                }
                description="Either password or SSH key is required"
              />
              <Textarea
                label="SSH Private Key"
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                value={sftpForm.sftp_key}
                onChange={(e) =>
                  setSftpForm({ ...sftpForm, sftp_key: e.target.value })
                }
                rows={6}
                description="Either password or SSH key is required"
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Divider />
        <Text c="dimmed" size="sm">
          All sensitive credentials (passwords, tokens, keys) are encrypted
          before being stored in the database.
        </Text>

        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save Data Source</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
