import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  Box,
  ActionIcon,
  Menu,
  Avatar,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  IconPlug,
  IconStack2,
  IconPackage,
  IconBoxMultiple,
  IconActivity,
  IconSettings,
  IconBolt,
  IconLogout,
  IconUser,
} from "@tabler/icons-react";
import { useAuthStore } from "../store/useAuthStore";
import { useAppStore } from "../store/useAppStore";

const items = [
  { label: "Dashboard", path: "/", icon: IconBolt },
  { label: "Data Sources", path: "/data-sources", icon: IconPlug },
  { label: "Streams", path: "/streams", icon: IconStack2 },
  { label: "Topics", path: "/topics", icon: IconPackage },
  { label: "Data Models", path: "/models", icon: IconBoxMultiple },
  { label: "Runs", path: "/runs", icon: IconActivity },
  { label: "Settings", path: "/settings", icon: IconSettings },
];

export function AppShellLayout() {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { fetchAll } = useAppStore();

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

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
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon variant="subtle" size="lg">
                  <Avatar size="sm" color="blue">
                    <IconUser size={18} />
                  </Avatar>
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>{user?.username || "User"}</Menu.Label>
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  onClick={handleLogout}
                  color="red"
                >
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
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
          Connected to backend. All data is persisted to the database.
        </Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
