import { Card, Group, Title, Text, Stack, Button, Badge, Accordion, Table } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useAppStore } from "../store/useAppStore";
import { useState } from "react";
import { TopicDrawer } from "../features/sources/TopicDrawer";

export function TopicsPage() {
  const topics = useAppStore((s) => s.topics);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [drawerOpen, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Topics</Title>
          <Text c="dimmed">
            Collections of data packages with defined schemas. Each topic can have multiple revisions.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openDrawer}>Create Topic</Button>
      </Group>

      <Card withBorder>
        {topics.length === 0 ? (
          <Text c="dimmed">
            No topics yet. Create a topic to organize data packages with a defined schema.
          </Text>
        ) : (
          <Accordion value={selectedTopic} onChange={setSelectedTopic}>
            {topics.map((topic) => (
              <Accordion.Item key={topic.id} value={topic.id}>
                <Accordion.Control>
                  <Group justify="space-between">
                    <div>
                      <Text fw={500}>{topic.name}</Text>
                      {topic.description && (
                        <Text size="sm" c="dimmed">
                          {topic.description}
                        </Text>
                      )}
                    </div>
                    <Group>
                      <Badge variant="light">
                        {topic.revisions?.length || 0} revision{topic.revisions?.length !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="light" color="blue">
                        {topic.total_packages || 0} package{topic.total_packages !== 1 ? 's' : ''}
                      </Badge>
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    {topic.revisions && topic.revisions.length > 0 ? (
                      topic.revisions.map((revision) => (
                        <Card key={revision.id} withBorder>
                          <Stack gap="xs">
                            <Group justify="space-between">
                              <Text fw={500}>Revision {revision.revision_number}</Text>
                              <Badge variant="light">{revision.package_count || 0} packages</Badge>
                            </Group>
                            
                            {revision.change_description && (
                              <Text size="sm" c="dimmed">
                                {revision.change_description}
                              </Text>
                            )}

                            {revision.schema && revision.schema.length > 0 && (
                              <div>
                                <Text size="sm" fw={500} mb="xs">
                                  Schema:
                                </Text>
                                <Table highlightOnHover>
                                  <Table.Thead>
                                    <Table.Tr>
                                      <Table.Th>Position</Table.Th>
                                      <Table.Th>Column Name</Table.Th>
                                      <Table.Th>Data Type</Table.Th>
                                      <Table.Th>Nullable</Table.Th>
                                    </Table.Tr>
                                  </Table.Thead>
                                  <Table.Tbody>
                                    {revision.schema
                                      .sort((a: any, b: any) => a.position - b.position)
                                      .map((col: any) => (
                                        <Table.Tr key={col.position}>
                                          <Table.Td>{col.position}</Table.Td>
                                          <Table.Td>
                                            <Text fw={500}>{col.name}</Text>
                                          </Table.Td>
                                          <Table.Td>
                                            <Badge size="sm" variant="light">
                                              {col.data_type}
                                            </Badge>
                                          </Table.Td>
                                          <Table.Td>
                                            {col.nullable ? (
                                              <Text c="dimmed" size="sm">Yes</Text>
                                            ) : (
                                              <Text fw={500} size="sm">No</Text>
                                            )}
                                          </Table.Td>
                                        </Table.Tr>
                                      ))}
                                  </Table.Tbody>
                                </Table>
                              </div>
                            )}

                            <Text size="xs" c="dimmed">
                              Created: {new Date(revision.created_at).toLocaleString()}
                            </Text>
                          </Stack>
                        </Card>
                      ))
                    ) : (
                      <Text c="dimmed" size="sm">
                        No revisions yet for this topic.
                      </Text>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Card>
      
      <TopicDrawer opened={drawerOpen} onClose={closeDrawer} />
    </Stack>
  );
}
