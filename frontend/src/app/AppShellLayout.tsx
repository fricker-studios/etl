import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  Box,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  IconDatabase,
  IconPlug,
  IconStack2,
  IconPackage,
  IconBoxMultiple,
  IconActivity,
  IconSettings,
  IconBolt,
} from "@tabler/icons-react";

const items = [
  { label: "Dashboard", path: "/", icon: IconBolt },
  { label: "Connections", path: "/connections", icon: IconDatabase },
  { label: "API Sources", path: "/api-sources", icon: IconPlug },
  { label: "Streams", path: "/streams", icon: IconStack2 },
  { label: "Data Packages", path: "/packages", icon: IconPackage },
  { label: "Models", path: "/models", icon: IconBoxMultiple },
  { label: "Runs", path: "/runs", icon: IconActivity },
  { label: "Settings", path: "/settings", icon: IconSettings },
];

export function AppShellLayout() {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Group gap={10}>
              <Box
                w={28}
                h={28}
                style={{
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #7aa2ff, #9bffdd)",
                }}
              />
              <Text fw={700}>Pipeline Studio</Text>
              <Text c="dimmed" size="sm">
                ETL / ELT UI
              </Text>
            </Group>
          </Group>

          <Group>
            <Tooltip label="This is a frontend-only prototype">
              <ActionIcon variant="light">
                <IconBolt size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {items.map((it) => {
          const active =
            it.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(it.path);
          const Icon = it.icon;
          return (
            <NavLink
              key={it.path}
              active={active}
              label={it.label}
              leftSection={<Icon size={18} />}
              onClick={() => navigate(it.path)}
              variant="filled"
              mb={6}
            />
          );
        })}
        <Text c="dimmed" size="xs" mt="md" px="xs">
          Tip: Everything is saved to localStorage so you can refresh without
          losing your setup.
        </Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
