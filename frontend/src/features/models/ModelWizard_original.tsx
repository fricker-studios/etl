import {
  Modal,
  Stepper,
  Group,
  Button,
  Stack,
  TextInput,
  Select,
  MultiSelect,
  Divider,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { notifications } from "@mantine/notifications";
import { ModelCanvasMock } from "./ModelCanvasMock";

export function ModelWizard({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { packages, upsertModel } = useAppStore();
  const [active, setActive] = useState(0);

  const [type, setType] = useState<"data_vault" | "dimensional">("data_vault");
  const [name, setName] = useState("Customer Model");
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);

  const pkgOptions = packages.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.status})`,
  }));

  const save = () => {
    if (!name.trim()) return;
    if (type === "data_vault") {
      upsertModel({
        name,
        type,
        packages: selectedPackages,
        hubs: [{ name: "HubCustomer", businessKey: "customer_id" }],
        links: [
          { name: "LinkCustomerOrder", hubs: ["HubCustomer", "HubOrder"] },
        ],
        satellites: [
          {
            name: "SatCustomerProfile",
            parent: "HubCustomer",
            attributes: ["email", "created_at"],
          },
        ],
      } as any);
    } else {
      upsertModel({
        name,
        type,
        packages: selectedPackages,
        facts: [
          {
            name: "FactOrders",
            grain: "order_id",
            measures: ["revenue"],
            dimensions: ["DimCustomer", "DimDate"],
          },
        ],
        dimensions: [
          {
            name: "DimCustomer",
            key: "customer_id",
            attributes: ["email", "segment"],
          },
        ],
      } as any);
    }
    notifications.show({ message: "Model saved", color: "teal" });
    setActive(0);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Create model" size="xl">
      <Stepper active={active} onStepClick={setActive}>
        <Stepper.Step label="Basics">
          <Stack>
            <TextInput
              label="Model name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              label="Model type"
              value={type}
              onChange={(v) => setType((v as any) ?? "data_vault")}
              data={[
                { value: "data_vault", label: "Data Vault (hubs/links/sats)" },
                {
                  value: "dimensional",
                  label: "Dimensional (facts/dimensions)",
                },
              ]}
            />
            <MultiSelect
              label="Input data packages"
              data={pkgOptions}
              value={selectedPackages}
              onChange={setSelectedPackages}
              description="Models consume materialized packages (in a real backend)."
              searchable
              nothingFoundMessage="No packages yet"
            />
            <Group justify="flex-end">
              <Button onClick={() => setActive(1)}>Next</Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Design">
          <Stack>
            <Divider label="Designer (mock)" />
            <Text c="dimmed" size="sm">
              This is a frontend-only “canvas” that represents what a real
              modeling UI would look like. You’d typically drag fields from
              inferred schemas, define keys, grains, and constraints.
            </Text>
            <ModelCanvasMock type={type} />
            <Group justify="space-between">
              <Button variant="light" onClick={() => setActive(0)}>
                Back
              </Button>
              <Button onClick={() => setActive(2)}>Next</Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Review">
          <Stack>
            <Divider label="Summary" />
            <pre style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>
              {JSON.stringify(
                { name, type, packages: selectedPackages },
                null,
                2,
              )}
            </pre>
            <Group justify="space-between">
              <Button variant="light" onClick={() => setActive(1)}>
                Back
              </Button>
              <Button onClick={save}>Save model</Button>
            </Group>
          </Stack>
        </Stepper.Step>
      </Stepper>
    </Modal>
  );
}
