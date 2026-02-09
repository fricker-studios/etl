import { Button, Group, Stack, Table, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

export interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
}: KeyValueEditorProps) {
  const addPair = () => {
    onChange([...pairs, { key: "", value: "" }]);
  };

  const removePair = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const updatePair = (index: number, field: "key" | "value", value: string) => {
    const updated = [...pairs];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <Stack>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Value</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pairs.map((pair, idx) => (
            <Table.Tr key={idx}>
              <Table.Td>
                <TextInput
                  value={pair.key}
                  onChange={(e) => updatePair(idx, "key", e.target.value)}
                  placeholder={keyPlaceholder}
                  size="xs"
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  value={pair.value}
                  onChange={(e) => updatePair(idx, "value", e.target.value)}
                  placeholder={valuePlaceholder}
                  size="xs"
                />
              </Table.Td>
              <Table.Td>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  onClick={() => removePair(idx)}
                >
                  <IconTrash size={16} />
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group>
        <Button leftSection={<IconPlus size={16} />} onClick={addPair} size="sm">
          Add Row
        </Button>
      </Group>
    </Stack>
  );
}
