import { Card, SimpleGrid, Textarea, Text, Badge, Stack } from "@mantine/core";

export function JsonPreviewPanel({
  value,
  onChange,
  parseError,
  inferredSchemaText,
  onSchemaChange,
}: {
  value: string;
  onChange: (v: string) => void;
  parseError?: string;
  inferredSchemaText?: string;
  onSchemaChange?: (v: string) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      <Card withBorder>
        <Stack>
          <Badge variant="light">Response preview (JSON)</Badge>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autosize
            minRows={18}
            description="Test your API or paste sample JSON response"
          />
          {parseError && <Text c="red">Parse error: {parseError}</Text>}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Badge variant="light">Inferred schema (editable)</Badge>
          {inferredSchemaText ? (
            <Textarea
              value={inferredSchemaText}
              onChange={(e) => onSchemaChange?.(e.target.value)}
              autosize
              minRows={18}
              description="Edit the inferred schema if needed"
              styles={{
                input: {
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                },
              }}
            />
          ) : (
            <Text c="dimmed">Provide valid JSON to infer schema.</Text>
          )}
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
