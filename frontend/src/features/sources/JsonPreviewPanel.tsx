import { Card, SimpleGrid, Textarea, Text, Badge, Stack } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";

export function JsonPreviewPanel({
  value,
  onChange,
  parseError,
  inferredSchemaText,
}: {
  value: string;
  onChange: (v: string) => void;
  parseError?: string;
  inferredSchemaText?: string;
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
            description="Frontend-only. In a real system, you’d test the request here."
          />
          {parseError && <Text c="red">Parse error: {parseError}</Text>}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Badge variant="light">Inferred schema</Badge>
          {inferredSchemaText ? (
            <CodeHighlight code={inferredSchemaText} language="text" />
          ) : (
            <Text c="dimmed">Provide valid JSON to infer schema.</Text>
          )}
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
