import {
  Card,
  Grid,
  Group,
  Text,
  Title,
  Badge,
  Button,
  Stack,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/common/PageHeader";
import { useStorageBackends } from "../hooks/useStorageBackends";
import { useDataSources } from "../hooks/useDataSources";
import { useStreams } from "../hooks/useStreams";
import { useModels } from "../hooks/useModels";
import { usePackages } from "../hooks/usePackages";

export function DashboardPage() {
  const nav = useNavigate();
  const { data: storageBackends = [] } = useStorageBackends();
  const { data: dataSources = [] } = useDataSources();
  const { data: streams = [] } = useStreams();
  const { data: models = [] } = useModels();
  const { data: packages = [] } = usePackages();

  return (
    <Stack>
      <PageHeader
        title="Dashboard"
        description="Configure sources → define streams → materialize data packages → model it."
      />

      <Group>
        <Button variant="light" onClick={() => nav("/settings")}>
          New Connection
        </Button>
        <Button onClick={() => nav("/streams")}>New Stream</Button>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder>
            <Text c="dimmed" size="sm">
              Storage Backends
            </Text>
            <Group justify="space-between" mt="xs">
              <Title order={2}>{storageBackends.length}</Title>
              <Badge variant="light">App Storage</Badge>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder>
            <Text c="dimmed" size="sm">
              Data Sources
            </Text>
            <Group justify="space-between" mt="xs">
              <Title order={2}>{dataSources.length}</Title>
              <Badge variant="light">Roots + Auth</Badge>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder>
            <Text c="dimmed" size="sm">
              Streams
            </Text>
            <Group justify="space-between" mt="xs">
              <Title order={2}>{streams.length}</Title>
              <Badge variant="light">Source Mappings</Badge>
            </Group>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
          <Card withBorder>
            <Text c="dimmed" size="sm">
              Models
            </Text>
            <Group justify="space-between" mt="xs">
              <Title order={2}>{models.length}</Title>
              <Badge variant="light">Vault / Dim</Badge>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder>
        <Title order={4}>Suggested next steps</Title>
        <Text c="dimmed" mt={6}>
          If you’re starting fresh: add a destination (S3 or ClickHouse), then
          create an API source, then define a stream with a JSON preview so the
          schema can be inferred.
        </Text>
        <Group mt="md">
          <Button variant="light" onClick={() => nav("/settings")}>
            1) Configure Storage
          </Button>
          <Button variant="light" onClick={() => nav("/data-sources")}>
            2) Add Data Source
          </Button>
          <Button variant="light" onClick={() => nav("/streams")}>
            3) Add Stream + Preview
          </Button>
          <Button variant="light" onClick={() => nav("/packages")}>
            4) Package + Materialize
          </Button>
        </Group>
      </Card>

      <Card withBorder>
        <Title order={4}>Data Packages</Title>
        <Text c="dimmed" mt={6}>
          Packages are “frozen” ingestions (a stream at a point in time) that
          can be stored and later used to build models.
        </Text>
        <Group mt="md" gap="xs">
          <Badge variant="outline">
            draft: {packages.filter((p) => p.status === "draft").length}
          </Badge>
          <Badge variant="outline">
            queued: {packages.filter((p) => p.status === "queued").length}
          </Badge>
          <Badge variant="outline">
            materialized:{" "}
            {packages.filter((p) => p.status === "materialized").length}
          </Badge>
          <Badge variant="outline" color="red">
            failed: {packages.filter((p) => p.status === "failed").length}
          </Badge>
        </Group>
      </Card>
    </Stack>
  );
}
