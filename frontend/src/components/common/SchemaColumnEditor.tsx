import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

export interface SchemaColumn {
  name: string;
  position: number;
  data_type: string;
  nullable: boolean;
}

interface SchemaColumnEditorProps {
  columns: SchemaColumn[];
  onChange: (columns: SchemaColumn[]) => void;
}

const DATA_TYPES = [
  "string",
  "integer",
  "float",
  "boolean",
  "date",
  "datetime",
  "timestamp",
  "json",
  "array",
];

export function SchemaColumnEditor({
  columns,
  onChange,
}: SchemaColumnEditorProps) {
  const addColumn = () => {
    const newColumn: SchemaColumn = {
      name: "",
      position: columns.length,
      data_type: "string",
      nullable: true,
    };
    onChange([...columns, newColumn]);
  };

  const removeColumn = (position: number) => {
    const updated = columns
      .filter((c) => c.position !== position)
      .map((c, idx) => ({ ...c, position: idx }));
    onChange(updated);
  };

  const updateColumn = (
    position: number,
    field: keyof SchemaColumn,
    value: any,
  ) => {
    const updated = columns.map((c) =>
      c.position === position ? { ...c, [field]: value } : c,
    );
    onChange(updated);
  };

  return (
    <Stack>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Position</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Data Type</Table.Th>
            <Table.Th>Nullable</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {columns.map((col) => (
            <Table.Tr key={col.position}>
              <Table.Td>
                <NumberInput
                  value={col.position}
                  onChange={(v) =>
                    updateColumn(col.position, "position", Number(v))
                  }
                  min={0}
                  size="xs"
                  styles={{ input: { width: 60 } }}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  value={col.name}
                  onChange={(e) =>
                    updateColumn(col.position, "name", e.target.value)
                  }
                  size="xs"
                  placeholder="column_name"
                />
              </Table.Td>
              <Table.Td>
                <Select
                  value={col.data_type}
                  onChange={(v) =>
                    updateColumn(col.position, "data_type", v || "string")
                  }
                  data={DATA_TYPES}
                  size="xs"
                />
              </Table.Td>
              <Table.Td>
                <Select
                  value={col.nullable ? "true" : "false"}
                  onChange={(v) =>
                    updateColumn(col.position, "nullable", v === "true")
                  }
                  data={[
                    { value: "true", label: "Yes" },
                    { value: "false", label: "No" },
                  ]}
                  size="xs"
                />
              </Table.Td>
              <Table.Td>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  onClick={() => removeColumn(col.position)}
                >
                  <IconTrash size={16} />
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group>
        <Button leftSection={<IconPlus size={16} />} onClick={addColumn}>
          Add Column
        </Button>
      </Group>
    </Stack>
  );
}
