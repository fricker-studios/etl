import { Group, Title, Text, Button } from "@mantine/core";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end">
      <div>
        <Title order={2}>{title}</Title>
        {description && <Text c="dimmed">{description}</Text>}
      </div>
      {action && (
        <Button onClick={action.onClick} leftSection={action.icon}>
          {action.label}
        </Button>
      )}
    </Group>
  );
}
