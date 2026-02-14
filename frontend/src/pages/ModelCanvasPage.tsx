import {
  Stack,
  Card,
  Text,
  Button,
  Group,
  Badge,
  ActionIcon,
  Collapse,
  Box,
  Paper,
  Modal,
  TextInput,
  Select,
  MultiSelect,
  Menu,
  Divider,
  useMantineColorScheme,
  Tooltip,
  NumberInput,
} from "@mantine/core";
import {
  IconPlus,
  IconChevronDown,
  IconChevronRight,
  IconArrowLeft,
  IconDeviceFloppy,
  IconX,
  IconGripVertical,
  IconEdit,
  IconInfoCircle,
  IconHash,
  IconLetterCase,
  IconMathSymbols,
  IconCalendar,
  IconTransform,
  IconEqual,
} from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDisclosure } from "@mantine/hooks";
import { useTopics } from "../hooks/useTopics";
import { useCreateModel } from "../hooks/useModels";
import { useTransformations } from "../hooks/useTransformations";
import { notifications } from "@mantine/notifications";

type EntityType = "hub" | "link" | "satellite" | "fact" | "dimension";

interface FieldMapping {
  topicId: string;
  topicField: string; // column name
  modelField: string; // target field name in model
  transformation?: string; // transformation to apply
}

// Generic transformation component
interface TransformationComponent {
  id: string;
  position: { x: number; y: number };
  category: string; // String, Numeric, DateTime, Type Casting, Conditional, Hash
  transformationType: string; // e.g., "UPPER", "ROUND", "HASH"
  params: Record<string, any>; // transformation parameters
}

export function ModelCanvasPage() {
  const navigate = useNavigate();
  const { data: topics = [] } = useTopics();
  const { data: transformations } = useTransformations();
  const createModel = useCreateModel();
  const { colorScheme } = useMantineColorScheme();

  // Setup modal state
  const [setupModalOpen, { close: closeSetup }] = useDisclosure(true);
  const [modelName, setModelName] = useState("");
  const [modelType, setModelType] = useState<"data_vault" | "dimensional">(
    "data_vault",
  );
  const [entityType, setEntityType] = useState<EntityType>("hub");
  const [entityName, setEntityName] = useState("");
  const [isEntityNameManuallyEdited, setIsEntityNameManuallyEdited] =
    useState(false);

  // Canvas state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(
    {},
  );
  const [topicRevisions, setTopicRevisions] = useState<
    Record<string, string[]>
  >({}); // topicId -> revisionIds array
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [modelFields, setModelFields] = useState<string[]>([]); // Fields in the model
  const [modelFieldTypes, setModelFieldTypes] = useState<
    Record<string, string>
  >({}); // Data types for model fields

  // System/readonly fields that cannot be edited or deleted
  const SYSTEM_FIELDS = ["load_datetime", "record_source"];

  const [draggedColumn, setDraggedColumn] = useState<{
    topicId: string;
    columnName: string;
  } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const topicColRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const topicCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const modelFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Positions for draggable elements
  const [topicPositions, setTopicPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [modelPosition, setModelPosition] = useState({ x: 750, y: 100 });
  const [draggingTopic, setDraggingTopic] = useState<string | null>(null);
  const [draggingModel, setDraggingModel] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Canvas panning state
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 });

  // Context menu state
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showTopicSubmenu, setShowTopicSubmenu] = useState(false);
  const [showTransformSubmenu, setShowTransformSubmenu] = useState(false);

  // Hash components state (legacy - being replaced by generic transformation components)
  const [hashComponents, setHashComponents] = useState<
    Array<{
      id: string;
      position: { x: number; y: number };
      hashMethod: string;
      inputString: string;
      outputString: string;
    }>
  >([]);
  const [draggingHash, setDraggingHash] = useState<string | null>(null);

  // Generic transformation components state
  const [transformationComponents, setTransformationComponents] = useState<
    TransformationComponent[]
  >([]);
  const [draggingTransform, setDraggingTransform] = useState<string | null>(
    null,
  );

  // Hash connection state
  const [hashConnections, setHashConnections] = useState<
    Array<{
      id: string;
      sourceType: "topic" | "hash";
      sourceId: string; // topicId or hashId
      sourceField?: string; // for topic sources
      targetType: "hash" | "model";
      targetId?: string; // hashId (for hash targets)
      targetField?: string; // field name (for model targets)
    }>
  >([]);
  const [draggedToHash, setDraggedToHash] = useState<{
    topicId: string;
    columnName: string;
  } | null>(null);
  const [draggedFromHash, setDraggedFromHash] = useState<string | null>(null); // hashId
  const hashNodeRefs = useRef<
    Record<
      string,
      { input: HTMLDivElement | null; output: HTMLDivElement | null }
    >
  >({});

  // Auto-generate entity name when model name or entity type changes
  // Only auto-generate if the user hasn't manually edited the entity name
  useEffect(() => {
    if (modelName && !isEntityNameManuallyEdited) {
      const prefix =
        entityType === "hub"
          ? "Hub"
          : entityType === "link"
            ? "Link"
            : entityType === "satellite"
              ? "Sat"
              : entityType === "fact"
                ? "Fact"
                : "Dim";
      // Clean the name: remove whitespace and special characters, keep alphanumeric
      const cleanName = modelName.replace(/[^a-zA-Z0-9]/g, "");

      // Fallback to "Unnamed" if the cleaned name is empty
      const finalName = cleanName || "Unnamed";
      setEntityName(`${prefix}_${finalName}`);
    }
  }, [modelName, entityType, isEntityNameManuallyEdited]);

  const handleSetupComplete = () => {
    if (!modelName.trim()) {
      notifications.show({
        message: "Please enter a model name",
        color: "red",
      });
      return;
    }

    // Auto-create required fields based on entity type
    const requiredFields: string[] = [];
    const fieldTypes: Record<string, string> = {};
    const readonlyFields: string[] = []; // Track which fields are system/readonly

    if (entityType === "hub") {
      requiredFields.push("hash_key", "business_key");
      fieldTypes["hash_key"] = "string";
      fieldTypes["business_key"] = "string";

      // Add standard Data Vault columns as readonly
      requiredFields.push("load_datetime", "record_source");
      fieldTypes["load_datetime"] = "timestamp";
      fieldTypes["record_source"] = "string";
      readonlyFields.push("load_datetime", "record_source");

      // Auto-create hash component for hub
      const hashCompId = `hash-${Date.now()}`;
      setHashComponents([
        {
          id: hashCompId,
          position: { x: 400, y: 200 },
          hashMethod: "SHA-256",
          inputString: "",
          outputString: "",
        },
      ]);

      // Auto-connect hash output to hash_key field
      setHashConnections([
        {
          id: `conn-${Date.now()}`,
          sourceType: "hash",
          sourceId: hashCompId,
          targetType: "model",
          targetField: "hash_key",
        },
      ]);
    } else if (entityType === "link") {
      requiredFields.push("link_key");
      fieldTypes["link_key"] = "string";

      // Add standard Data Vault columns as readonly
      requiredFields.push("load_datetime", "record_source");
      fieldTypes["load_datetime"] = "timestamp";
      fieldTypes["record_source"] = "string";
      readonlyFields.push("load_datetime", "record_source");
    } else if (entityType === "satellite") {
      requiredFields.push("parent_key", "load_date");
      fieldTypes["parent_key"] = "string";
      fieldTypes["load_date"] = "timestamp";

      // Add standard Data Vault columns as readonly
      requiredFields.push("load_datetime", "record_source");
      fieldTypes["load_datetime"] = "timestamp";
      fieldTypes["record_source"] = "string";
      readonlyFields.push("load_datetime", "record_source");
    } else if (entityType === "fact") {
      requiredFields.push("grain");
      fieldTypes["grain"] = "string";
    } else if (entityType === "dimension") {
      requiredFields.push("dimension_key");
      fieldTypes["dimension_key"] = "string";
    }

    setModelFields(requiredFields);
    setModelFieldTypes(fieldTypes);
    // Store readonly fields in state (you'll need to add this state)
    // For now, we'll handle it in the render
    closeSetup();
  };

  const handleAddTopic = (topicId: string) => {
    if (!selectedTopics.includes(topicId)) {
      setSelectedTopics([...selectedTopics, topicId]);
      setExpandedTopics({ ...expandedTopics, [topicId]: true });
      // Initialize position for new topic
      const index = selectedTopics.length;
      setTopicPositions({
        ...topicPositions,
        [topicId]: { x: 50, y: 100 + index * 250 },
      });
      // Set default revision (current revision or latest) as an array
      const topic = topics.find((t: any) => String(t.id) === topicId);
      if (topic) {
        const defaultRevisionId =
          topic.current_revision?.id ||
          topic.revisions?.[topic.revisions.length - 1]?.id;
        if (defaultRevisionId) {
          setTopicRevisions({
            ...topicRevisions,
            [topicId]: [String(defaultRevisionId)],
          });
        }
      }
    }
  };

  const handleRemoveTopic = (topicId: string) => {
    setSelectedTopics(selectedTopics.filter((id) => id !== topicId));
    // Remove mappings for this topic
    setFieldMappings(fieldMappings.filter((m) => m.topicId !== topicId));
    // Remove position for this topic
    const newPositions = { ...topicPositions };
    delete newPositions[topicId];
    setTopicPositions(newPositions);
  };

  // Topic drag handlers
  const handleTopicMouseDown = (topicId: string, e: React.MouseEvent) => {
    // Don't start dragging if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT" ||
      target.closest("button") ||
      target.closest("[draggable]")
    ) {
      return;
    }

    if (!canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const pos = topicPositions[topicId] || { x: 50, y: 100 };

    setDraggingTopic(topicId);
    setDragOffset({
      x: e.clientX - canvasRect.left - pos.x + canvasRef.current.scrollLeft,
      y: e.clientY - canvasRect.top - pos.y + canvasRef.current.scrollTop,
    });
  };

  // Model drag handlers
  const handleModelMouseDown = (e: React.MouseEvent) => {
    // Don't start dragging if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT" ||
      target.closest("button") ||
      target.closest("[draggable]")
    ) {
      return;
    }

    if (!canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    setDraggingModel(true);
    setDragOffset({
      x:
        e.clientX -
        canvasRect.left -
        modelPosition.x +
        canvasRef.current.scrollLeft,
      y:
        e.clientY -
        canvasRect.top -
        modelPosition.y +
        canvasRef.current.scrollTop,
    });
  };

  // Canvas panning handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only start panning if clicking on the canvas background (not on cards or other elements)
    // Check if the target is the canvas container itself or the canvas content div
    const target = e.target as HTMLElement;
    const isCanvasBackground =
      e.target === e.currentTarget ||
      target.hasAttribute("data-canvas-content");

    if (!isCanvasBackground) {
      return;
    }

    if (!canvasRef.current) return;

    setIsPanningCanvas(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setScrollStart({
      left: canvasRef.current.scrollLeft,
      top: canvasRef.current.scrollTop,
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    if (draggingTopic) {
      // Calculate position relative to canvas, accounting for scroll
      const newX =
        e.clientX -
        canvasRect.left -
        dragOffset.x +
        canvasRef.current.scrollLeft;
      const newY =
        e.clientY - canvasRect.top - dragOffset.y + canvasRef.current.scrollTop;
      setTopicPositions({
        ...topicPositions,
        [draggingTopic]: { x: newX, y: newY },
      });
    } else if (draggingModel) {
      // Calculate position relative to canvas, accounting for scroll
      const newX =
        e.clientX -
        canvasRect.left -
        dragOffset.x +
        canvasRef.current.scrollLeft;
      const newY =
        e.clientY - canvasRect.top - dragOffset.y + canvasRef.current.scrollTop;
      setModelPosition({ x: newX, y: newY });
    } else if (draggingHash) {
      // Calculate position relative to canvas, accounting for scroll
      const newX =
        e.clientX -
        canvasRect.left -
        dragOffset.x +
        canvasRef.current.scrollLeft;
      const newY =
        e.clientY - canvasRect.top - dragOffset.y + canvasRef.current.scrollTop;
      setHashComponents(
        hashComponents.map((h) =>
          h.id === draggingHash ? { ...h, position: { x: newX, y: newY } } : h,
        ),
      );
    } else if (draggingTransform) {
      // Calculate position relative to canvas, accounting for scroll
      const newX =
        e.clientX -
        canvasRect.left -
        dragOffset.x +
        canvasRef.current.scrollLeft;
      const newY =
        e.clientY - canvasRect.top - dragOffset.y + canvasRef.current.scrollTop;
      setTransformationComponents(
        transformationComponents.map((t) =>
          t.id === draggingTransform
            ? { ...t, position: { x: newX, y: newY } }
            : t,
        ),
      );
    } else if (isPanningCanvas) {
      // Pan the canvas by adjusting scroll position
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      canvasRef.current.scrollLeft = scrollStart.left - deltaX;
      canvasRef.current.scrollTop = scrollStart.top - deltaY;
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingTopic(null);
    setDraggingModel(false);
    setDraggingHash(null);
    setDraggingTransform(null);
    setIsPanningCanvas(false);
  };

  // Context menu handlers
  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenuPos(null);
    setShowTopicSubmenu(false);
    setShowTransformSubmenu(false);
  };

  const toggleTopicExpanded = (topicId: string) => {
    setExpandedTopics({
      ...expandedTopics,
      [topicId]: !expandedTopics[topicId],
    });
  };

  const handleAddModelField = () => {
    const fieldName = `field_${modelFields.length + 1}`;
    setModelFields([...modelFields, fieldName]);
    setModelFieldTypes({ ...modelFieldTypes, [fieldName]: "string" }); // Default to string type
  };

  const handleRemoveModelField = (fieldName: string) => {
    // Prevent deletion of system fields
    if (SYSTEM_FIELDS.includes(fieldName)) {
      notifications.show({
        message: "Cannot delete system fields",
        color: "red",
      });
      return;
    }

    setModelFields(modelFields.filter((f) => f !== fieldName));
    // Remove field type
    const updatedTypes = { ...modelFieldTypes };
    delete updatedTypes[fieldName];
    setModelFieldTypes(updatedTypes);
    // Remove any mappings to this field
    setFieldMappings(fieldMappings.filter((m) => m.modelField !== fieldName));
    // Remove related hash connections
    setHashConnections(
      hashConnections.filter((c) => c.targetField !== fieldName),
    );
  };

  const handleColumnDragStart = (topicId: string, columnName: string) => {
    setDraggedColumn({ topicId, columnName });
    setDraggedToHash({ topicId, columnName }); // Also enable dragging to hash
  };

  const handleColumnDragEnd = () => {
    setDraggedColumn(null);
    setDraggedToHash(null);
  };

  // Hash connection handlers
  const handleHashInputDrop = (hashId: string) => {
    if (!draggedToHash) return;

    // Check if connection already exists
    const existingConnection = hashConnections.find(
      (c) =>
        c.sourceType === "topic" &&
        c.sourceId === draggedToHash.topicId &&
        c.sourceField === draggedToHash.columnName &&
        c.targetType === "hash" &&
        c.targetId === hashId,
    );

    if (existingConnection) {
      notifications.show({
        message: "This connection already exists",
        color: "orange",
      });
      setDraggedToHash(null);
      return;
    }

    // Add new connection
    setHashConnections([
      ...hashConnections,
      {
        id: `conn-${Date.now()}`,
        sourceType: "topic",
        sourceId: draggedToHash.topicId,
        sourceField: draggedToHash.columnName,
        targetType: "hash",
        targetId: hashId,
      },
    ]);

    notifications.show({
      message: "Connected to hash input",
      color: "green",
    });

    setDraggedToHash(null);
  };

  const handleHashOutputDragStart = (hashId: string) => {
    setDraggedFromHash(hashId);
  };

  const handleHashOutputDragEnd = () => {
    setDraggedFromHash(null);
  };

  const handleModelFieldDropFromHash = (modelField: string) => {
    if (!draggedFromHash) return;

    // Check if connection already exists
    const existingConnection = hashConnections.find(
      (c) =>
        c.sourceType === "hash" &&
        c.sourceId === draggedFromHash &&
        c.targetType === "model" &&
        c.targetField === modelField,
    );

    if (existingConnection) {
      notifications.show({
        message: "This connection already exists",
        color: "orange",
      });
      setDraggedFromHash(null);
      return;
    }

    // Add new connection
    setHashConnections([
      ...hashConnections,
      {
        id: `conn-${Date.now()}`,
        sourceType: "hash",
        sourceId: draggedFromHash,
        targetType: "model",
        targetField: modelField,
      },
    ]);

    notifications.show({
      message: "Connected hash output to model field",
      color: "green",
    });

    setDraggedFromHash(null);
  };

  const handleFieldDrop = (modelField: string) => {
    // Handle drop from hash output
    if (draggedFromHash) {
      handleModelFieldDropFromHash(modelField);
      return;
    }

    // Handle drop from topic column
    if (!draggedColumn) return;

    // Check if this mapping already exists
    const existingMapping = fieldMappings.find(
      (m) =>
        m.topicId === draggedColumn.topicId &&
        m.topicField === draggedColumn.columnName &&
        m.modelField === modelField,
    );

    if (existingMapping) {
      notifications.show({
        message: "This mapping already exists",
        color: "orange",
      });
      setDraggedColumn(null);
      return;
    }

    // Add new mapping
    setFieldMappings([
      ...fieldMappings,
      {
        topicId: draggedColumn.topicId,
        topicField: draggedColumn.columnName,
        modelField: modelField,
      },
    ]);

    setDraggedColumn(null);
    notifications.show({
      message: "Mapping created",
      color: "green",
    });
  };

  const handleRemoveMapping = (mapping: FieldMapping) => {
    setFieldMappings(
      fieldMappings.filter(
        (m) =>
          !(
            m.topicId === mapping.topicId &&
            m.topicField === mapping.topicField &&
            m.modelField === mapping.modelField
          ),
      ),
    );
  };

  const handleRemoveHashConnection = (connectionId: string) => {
    setHashConnections(hashConnections.filter((c) => c.id !== connectionId));
    notifications.show({
      message: "Connection removed",
      color: "blue",
    });
  };

  const handleStartEditField = (fieldName: string) => {
    setEditingField(fieldName);
    setEditingFieldValue(fieldName);
  };

  const handleFinishEditField = () => {
    if (!editingField) return;

    const trimmedValue = editingFieldValue.trim();

    // Validate field name
    if (!trimmedValue) {
      notifications.show({
        message: "Field name cannot be empty",
        color: "red",
      });
      setEditingField(null);
      return;
    }

    // Check for duplicate names
    if (trimmedValue !== editingField && modelFields.includes(trimmedValue)) {
      notifications.show({
        message: "Field name already exists",
        color: "red",
      });
      setEditingField(null);
      return;
    }

    // Update field name
    const updatedFields = modelFields.map((f) =>
      f === editingField ? trimmedValue : f,
    );
    setModelFields(updatedFields);

    // Update field type key if field was renamed
    if (editingField && trimmedValue !== editingField) {
      const updatedTypes = { ...modelFieldTypes };
      if (updatedTypes[editingField]) {
        updatedTypes[trimmedValue] = updatedTypes[editingField];
        delete updatedTypes[editingField];
        setModelFieldTypes(updatedTypes);
      }
    }

    // Update mappings to reflect new field name
    const updatedMappings = fieldMappings.map((m) =>
      m.modelField === editingField ? { ...m, modelField: trimmedValue } : m,
    );
    setFieldMappings(updatedMappings);

    // Update hash connections
    setHashConnections(
      hashConnections.map((c) =>
        c.targetField === editingField
          ? { ...c, targetField: trimmedValue }
          : c,
      ),
    );

    setEditingField(null);
  };

  const handleCancelEditField = () => {
    setEditingField(null);
    setEditingFieldValue("");
  };

  const handleSaveModel = async () => {
    if (!modelName.trim()) {
      notifications.show({
        message: "Please enter a model name",
        color: "red",
      });
      return;
    }

    if (selectedTopics.length === 0) {
      notifications.show({
        message: "Please add at least one topic",
        color: "red",
      });
      return;
    }

    if (fieldMappings.length === 0 && hashConnections.length === 0) {
      notifications.show({
        message: "Please create at least one field mapping",
        color: "red",
      });
      return;
    }

    // Build model data based on entity type
    const modelData: any = {
      name: modelName,
      type: modelType,
      topics: selectedTopics,
    };

    // Get all mapped fields (including hash transformations)
    const mappedFields = modelFields.filter(
      (field) =>
        fieldMappings.some((m) => m.modelField === field) ||
        hashConnections.some(
          (c) => c.targetType === "model" && c.targetField === field,
        ),
    );

    // Convert fieldMappings to the format expected by backend
    const formattedFieldMappings = fieldMappings.map((m) => ({
      model_field: m.modelField,
      topic_field: m.topicField,
      topic_id: m.topicId,
      topic_revision_id: JSON.stringify(topicRevisions[m.topicId] || []), // Serialize revision IDs array as JSON string
    }));

    // Convert hash connections to field mappings
    // For each complete hash transformation chain (topic -> hash -> model), create a mapping
    const hashBasedMappings: Array<{
      model_field: string;
      topic_field: string;
      topic_id: string;
      topic_revision_id?: string;
      transformation?: string;
    }> = [];

    // Changed approach: iterate over INPUT connections (topic -> hash)
    // For each input, find ALL output connections and create complete paths
    hashConnections.forEach((conn) => {
      if (conn.sourceType === "topic" && conn.targetType === "hash") {
        // This is a topic -> hash input connection
        // Find ALL output connections from this hash to model fields
        const outputConnections = hashConnections.filter(
          (c) =>
            c.sourceType === "hash" &&
            c.sourceId === conn.targetId &&
            c.targetType === "model" &&
            c.targetField,
        );

        // Create a mapping for each complete path: topic -> hash -> model
        outputConnections.forEach((outputConn) => {
          const hashComponent = hashComponents.find(
            (h) => h.id === conn.targetId,
          );
          if (hashComponent && conn.sourceField) {
            hashBasedMappings.push({
              model_field: outputConn.targetField!,
              topic_field: conn.sourceField,
              topic_id: conn.sourceId,
              topic_revision_id: JSON.stringify(
                topicRevisions[conn.sourceId] || [],
              ),
              transformation: `hash_${hashComponent.hashMethod}`,
            });
          }
        });
      }
    });

    // Combine direct mappings and hash-based mappings
    const allFormattedMappings = [
      ...formattedFieldMappings,
      ...hashBasedMappings,
    ];

    if (modelType === "data_vault") {
      if (entityType === "hub") {
        modelData.hubs = [
          {
            name: entityName,
            topic: selectedTopics[0],
            business_key: mappedFields[0] || "id",
            fields: mappedFields,
            field_mappings: allFormattedMappings,
          },
        ];
        modelData.links = [];
        modelData.satellites = [];
      } else if (entityType === "link") {
        modelData.hubs = [];
        modelData.links = [
          {
            name: entityName,
            topic: selectedTopics[0],
            hub_references: ["Hub_1", "Hub_2"],
            fields: mappedFields,
            field_mappings: allFormattedMappings,
          },
        ];
        modelData.satellites = [];
      } else if (entityType === "satellite") {
        modelData.hubs = [];
        modelData.links = [];
        modelData.satellites = [
          {
            name: entityName,
            topic: selectedTopics[0],
            parent: "Hub_Parent",
            fields: mappedFields,
            field_mappings: allFormattedMappings,
          },
        ];
      }
    } else {
      if (entityType === "fact") {
        modelData.facts = [
          {
            name: entityName,
            topic: selectedTopics[0],
            grain: "transaction",
            measures: mappedFields,
            dimension_keys: [],
            field_mappings: allFormattedMappings,
          },
        ];
        modelData.dimensions = [];
      } else {
        modelData.facts = [];
        modelData.dimensions = [
          {
            name: entityName,
            topic: selectedTopics[0],
            key: mappedFields[0] || "id",
            fields: mappedFields,
            field_mappings: allFormattedMappings,
          },
        ];
      }
    }

    try {
      await createModel.mutateAsync(modelData);
      navigate("/models");
    } catch (error) {
      // Error handled by hook
    }
  };

  // Helper function to get icon for transformation category
  const getTransformationIcon = (category: string) => {
    switch (category) {
      case "String":
        return IconLetterCase;
      case "Numeric":
        return IconMathSymbols;
      case "DateTime":
        return IconCalendar;
      case "Type Casting":
        return IconTransform;
      case "Conditional":
        return IconEqual;
      case "Hash":
        return IconHash;
      default:
        return IconTransform;
    }
  };

  // Helper function to create a transformation component
  const handleAddTransformationComponent = (
    category: string,
    transformationType: string,
  ) => {
    const newTransform: TransformationComponent = {
      id: `transform-${Date.now()}`,
      position: {
        x: contextMenuPos ? contextMenuPos.x - 100 : 300,
        y: contextMenuPos ? contextMenuPos.y - 100 : 300,
      },
      category,
      transformationType,
      params: {},
    };
    setTransformationComponents([...transformationComponents, newTransform]);
    notifications.show({
      message: `${transformationType} transformation added to canvas`,
      color: "blue",
    });
    closeContextMenu();
  };

  const getTopicFields = (topicId: string) => {
    const topic = topics.find((t: any) => String(t.id) === topicId);
    if (!topic) return [];

    // Use selected revisions if available
    const selectedRevisionIds = topicRevisions[topicId] || [];

    if (selectedRevisionIds.length > 0) {
      // Get all selected revisions
      const selectedRevs =
        topic.revisions?.filter((r: any) =>
          selectedRevisionIds.includes(String(r.id)),
        ) || [];

      if (selectedRevs.length > 0) {
        // Merge schemas - collect all unique columns across revisions
        const mergedFields = new Map();
        selectedRevs.forEach((rev: any) => {
          rev.schema?.forEach((col: any) => {
            if (!mergedFields.has(col.name)) {
              mergedFields.set(col.name, {
                ...col,
                revisionCount: 1,
                revisionIds: [String(rev.id)],
                revisionNumbers: [rev.revision_number],
              });
            } else {
              const existing = mergedFields.get(col.name);
              existing.revisionCount++;
              existing.revisionIds.push(String(rev.id));
              existing.revisionNumbers.push(rev.revision_number);
            }
          });
        });

        return Array.from(mergedFields.values());
      }
    }

    // Fall back to current revision
    return topic?.current_revision?.schema || [];
  };

  const getTopicInfo = (topicId: string) => {
    return topics.find((t: any) => String(t.id) === topicId);
  };

  const availableTopics = topics.filter(
    (t: any) => !selectedTopics.includes(String(t.id)),
  );

  // Calculate connection lines with rounded right angles
  const calculateConnectionLines = () => {
    const lines: Array<{
      path: string;
      color?: string;
      id?: string;
      type: "topic-model" | "topic-hash" | "hash-model";
      midX: number;
      midY: number;
    }> = [];

    if (!canvasRef.current) return lines;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft;
    const scrollTop = canvasRef.current.scrollTop;

    // Draw Topic -> Model field connections
    fieldMappings.forEach((mapping) => {
      const colKey = `${mapping.topicId}-${mapping.topicField}`;
      const colElement = topicColRefs.current[colKey];
      const topicCard = topicCardRefs.current[mapping.topicId];
      const fieldElement = modelFieldRefs.current[mapping.modelField];
      const isTopicExpanded = expandedTopics[mapping.topicId];

      // Determine the starting element based on whether topic is expanded
      const startElement = isTopicExpanded ? colElement : topicCard;

      if (startElement && fieldElement) {
        const startRect = startElement.getBoundingClientRect();
        const fieldRect = fieldElement.getBoundingClientRect();

        // Calculate positions relative to the canvas, accounting for scroll
        // If topic is collapsed, use the right edge center of the topic card
        const x1 = startRect.right - canvasRect.left + scrollLeft;
        const y1 =
          startRect.top + startRect.height / 2 - canvasRect.top + scrollTop;
        const x2 = fieldRect.left - canvasRect.left + scrollLeft;
        const y2 =
          fieldRect.top + fieldRect.height / 2 - canvasRect.top + scrollTop;

        // Create a path with rounded right angles
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const cornerRadius = 10;

        // Build the path: start -> horizontal -> vertical -> horizontal -> end
        // With rounded corners (always use curved path)
        let path = `M ${x1} ${y1}`;

        // Go horizontally to the midpoint minus corner radius
        path += ` L ${midX - cornerRadius} ${y1}`;

        // Add rounded corner going down or up
        if (y2 > y1) {
          path += ` Q ${midX} ${y1} ${midX} ${y1 + cornerRadius}`;
          path += ` L ${midX} ${y2 - cornerRadius}`;
          path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
        } else {
          path += ` Q ${midX} ${y1} ${midX} ${y1 - cornerRadius}`;
          path += ` L ${midX} ${y2 + cornerRadius}`;
          path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
        }

        // Go horizontally to the end point
        path += ` L ${x2} ${y2}`;

        lines.push({
          path,
          type: "topic-model",
          id: `${mapping.topicId}-${mapping.topicField}-${mapping.modelField}`,
          midX,
          midY,
        });
      }
    });

    // Draw Hash connections
    hashConnections.forEach((connection) => {
      if (
        connection.sourceType === "topic" &&
        connection.targetType === "hash" &&
        connection.targetId
      ) {
        // Topic field -> Hash input
        const colKey = `${connection.sourceId}-${connection.sourceField}`;
        const colElement = topicColRefs.current[colKey];
        const topicCard = topicCardRefs.current[connection.sourceId];
        const hashNodeRef = hashNodeRefs.current[connection.targetId];
        const isTopicExpanded = expandedTopics[connection.sourceId];

        const startElement = isTopicExpanded ? colElement : topicCard;

        if (startElement && hashNodeRef?.input) {
          const startRect = startElement.getBoundingClientRect();
          const hashRect = hashNodeRef.input.getBoundingClientRect();

          const x1 = startRect.right - canvasRect.left + scrollLeft;
          const y1 =
            startRect.top + startRect.height / 2 - canvasRect.top + scrollTop;
          const x2 =
            hashRect.left + hashRect.width / 2 - canvasRect.left + scrollLeft;
          const y2 =
            hashRect.top + hashRect.height / 2 - canvasRect.top + scrollTop;

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const cornerRadius = 10;

          let path = `M ${x1} ${y1}`;

          path += ` L ${midX - cornerRadius} ${y1}`;

          if (y2 > y1) {
            path += ` Q ${midX} ${y1} ${midX} ${y1 + cornerRadius}`;
            path += ` L ${midX} ${y2 - cornerRadius}`;
            path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
          } else {
            path += ` Q ${midX} ${y1} ${midX} ${y1 - cornerRadius}`;
            path += ` L ${midX} ${y2 + cornerRadius}`;
            path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
          }

          path += ` L ${x2} ${y2}`;

          lines.push({
            path,
            color: "#4dabf7",
            type: "topic-hash",
            id: connection.id,
            midX,
            midY,
          }); // Blue for hash input connections
        }
      } else if (
        connection.sourceType === "hash" &&
        connection.targetType === "model" &&
        connection.targetField
      ) {
        // Hash output -> Model field
        const hashNodeRef = hashNodeRefs.current[connection.sourceId];
        const fieldElement = modelFieldRefs.current[connection.targetField];

        if (hashNodeRef?.output && fieldElement) {
          const hashRect = hashNodeRef.output.getBoundingClientRect();
          const fieldRect = fieldElement.getBoundingClientRect();

          const x1 =
            hashRect.left + hashRect.width / 2 - canvasRect.left + scrollLeft;
          const y1 =
            hashRect.top + hashRect.height / 2 - canvasRect.top + scrollTop;
          const x2 = fieldRect.left - canvasRect.left + scrollLeft;
          const y2 =
            fieldRect.top + fieldRect.height / 2 - canvasRect.top + scrollTop;

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const cornerRadius = 10;

          let path = `M ${x1} ${y1}`;

          path += ` L ${midX - cornerRadius} ${y1}`;

          if (y2 > y1) {
            path += ` Q ${midX} ${y1} ${midX} ${y1 + cornerRadius}`;
            path += ` L ${midX} ${y2 - cornerRadius}`;
            path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
          } else {
            path += ` Q ${midX} ${y1} ${midX} ${y1 - cornerRadius}`;
            path += ` L ${midX} ${y2 + cornerRadius}`;
            path += ` Q ${midX} ${y2} ${midX + cornerRadius} ${y2}`;
          }

          path += ` L ${x2} ${y2}`;

          lines.push({
            path,
            color: "#51cf66",
            type: "hash-model",
            id: connection.id,
            midX,
            midY,
          }); // Green for hash output connections
        }
      }
    });

    return lines;
  };

  const [connectionLines, setConnectionLines] = useState<
    Array<{
      path: string;
      color?: string;
      id?: string;
      type: "topic-model" | "topic-hash" | "hash-model";
      midX: number;
      midY: number;
    }>
  >([]);

  // Update connection lines when mappings change
  useEffect(() => {
    const updateLines = () => {
      setConnectionLines(calculateConnectionLines());
    };

    // Initial calculation
    updateLines();

    // Recalculate on scroll or resize
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("scroll", updateLines);
      window.addEventListener("resize", updateLines);

      // Also update after a short delay to account for DOM updates
      const timer = setTimeout(updateLines, 100);

      return () => {
        canvas.removeEventListener("scroll", updateLines);
        window.removeEventListener("resize", updateLines);
        clearTimeout(timer);
      };
    }
  }, [
    fieldMappings,
    selectedTopics,
    expandedTopics,
    modelFields,
    topicPositions,
    modelPosition,
    hashConnections,
    hashComponents,
  ]);

  return (
    <>
      {/* Setup Modal */}
      <Modal
        opened={setupModalOpen}
        onClose={() => {}}
        title="Create Data Model"
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
      >
        <Stack>
          <TextInput
            label="Model Name"
            placeholder="e.g., Customer Analytics"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            required
          />
          <Select
            label="Model Type"
            value={modelType}
            onChange={(v) => {
              setModelType((v as any) || "data_vault");
              setEntityType(v === "data_vault" ? "hub" : "dimension");
            }}
            data={[
              { value: "data_vault", label: "Data Vault" },
              { value: "dimensional", label: "Dimensional" },
            ]}
            required
          />
          <Select
            label="Entity Type"
            value={entityType}
            onChange={(v) => setEntityType((v as EntityType) || "hub")}
            data={
              modelType === "data_vault"
                ? [
                    { value: "hub", label: "Hub - Business Entity" },
                    { value: "link", label: "Link - Relationship" },
                    { value: "satellite", label: "Satellite - Attributes" },
                  ]
                : [
                    { value: "fact", label: "Fact - Measurements" },
                    { value: "dimension", label: "Dimension - Context" },
                  ]
            }
            required
          />
          <TextInput
            label="Entity Name (auto-generated)"
            value={entityName}
            onChange={(e) => {
              setEntityName(e.target.value);
              setIsEntityNameManuallyEdited(true);
            }}
            description="You can customize the auto-generated name"
          />
          <Button onClick={handleSetupComplete} fullWidth>
            Start Building
          </Button>
        </Stack>
      </Modal>

      {/* Canvas Page */}
      <Stack
        h="calc(100vh - 60px)"
        p="md"
        gap="md"
        style={{ position: "relative" }}
      >
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" onClick={() => navigate("/models")}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Text size="xl" fw={700}>
                {modelName || "New Model"}
              </Text>
              <Group gap="xs">
                <Badge size="sm" variant="light">
                  {modelType === "data_vault" ? "Data Vault" : "Dimensional"}
                </Badge>
                <Badge size="sm" variant="outline">
                  {entityType}
                </Badge>
              </Group>
            </div>
          </Group>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSaveModel}
            loading={createModel.isPending}
          >
            Save Model
          </Button>
        </Group>

        {/* Single Canvas with SVG overlay */}
        <Box
          ref={canvasRef}
          style={{
            flex: 1,
            position: "relative",
            border: `1px solid ${colorScheme === "dark" ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-3)"}`,
            borderRadius: "8px",
            overflow: "auto",
            padding: "1rem",
            cursor:
              draggingTopic || draggingModel || draggingHash
                ? "grabbing"
                : isPanningCanvas
                  ? "grabbing"
                  : "default",
          }}
          bg={colorScheme === "dark" ? "dark.8" : "gray.0"}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onContextMenu={handleCanvasContextMenu}
        >
          {/* Floating Action Button - positioned inside canvas */}
          <Box style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon
                  size={56}
                  variant="filled"
                  color="blue"
                  radius="xl"
                  style={{
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  <IconPlus size={28} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu
                  trigger="hover"
                  openDelay={100}
                  closeDelay={400}
                  position="right"
                  offset={0}
                >
                  <Menu.Target>
                    <Menu.Item rightSection={<IconChevronRight size={14} />}>
                      Add Topic
                    </Menu.Item>
                  </Menu.Target>
                  <Menu.Dropdown
                    style={{ maxHeight: "400px", overflowY: "auto" }}
                  >
                    {availableTopics.length > 0 ? (
                      availableTopics.map((topic: any) => (
                        <Menu.Item
                          key={topic.id}
                          onClick={() => handleAddTopic(String(topic.id))}
                        >
                          {topic.name}
                        </Menu.Item>
                      ))
                    ) : (
                      <Menu.Item disabled>No more topics available</Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
                <Menu.Divider />
                <Menu
                  trigger="hover"
                  openDelay={100}
                  closeDelay={400}
                  position="right"
                  offset={0}
                >
                  <Menu.Target>
                    <Menu.Item rightSection={<IconChevronRight size={14} />}>
                      Add Transformation
                    </Menu.Item>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconHash size={16} />}
                      onClick={() => {
                        // Add hash component to canvas
                        const newHashComponent = {
                          id: `hash-${Date.now()}`,
                          position: { x: 300, y: 300 },
                          hashMethod: "MD5",
                          inputString: "",
                          outputString: "",
                        };
                        setHashComponents([
                          ...hashComponents,
                          newHashComponent,
                        ]);
                        notifications.show({
                          message: "Hash component added to canvas",
                          color: "blue",
                        });
                      }}
                    >
                      Hash
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Menu.Dropdown>
            </Menu>
          </Box>

          {/* Context Menu */}
          {contextMenuPos && (
            <>
              <Box
                role="button"
                tabIndex={0}
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 999,
                }}
                onClick={closeContextMenu}
                onContextMenu={(e) => {
                  e.preventDefault();
                  closeContextMenu();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    closeContextMenu();
                  }
                }}
                aria-label="Close context menu"
              />
              <Paper
                shadow="md"
                p={0}
                style={{
                  position: "fixed",
                  top: contextMenuPos.y,
                  left: contextMenuPos.x,
                  zIndex: 1000,
                  minWidth: 200,
                }}
              >
                <Stack gap={0}>
                  <Box
                    p="xs"
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      position: "relative",
                    }}
                    onMouseEnter={() => setShowTopicSubmenu(true)}
                    onMouseLeave={() => setShowTopicSubmenu(false)}
                  >
                    <Text size="sm">Add Topic</Text>
                    <IconChevronRight size={14} />

                    {/* Topic Submenu */}
                    {showTopicSubmenu && (
                      <Paper
                        shadow="md"
                        p={0}
                        style={{
                          position: "absolute",
                          left: "100%",
                          top: 0,
                          minWidth: 200,
                          maxHeight: "400px",
                          overflowY: "auto",
                          zIndex: 1001,
                        }}
                        onMouseEnter={() => setShowTopicSubmenu(true)}
                        onMouseLeave={() => setShowTopicSubmenu(false)}
                      >
                        <Stack gap={0}>
                          {availableTopics.length > 0 ? (
                            availableTopics.map((topic: any) => (
                              <Box
                                key={topic.id}
                                p="xs"
                                style={{
                                  cursor: "pointer",
                                }}
                                onClick={() => {
                                  handleAddTopic(String(topic.id));
                                  closeContextMenu();
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    colorScheme === "dark"
                                      ? "var(--mantine-color-dark-6)"
                                      : "var(--mantine-color-gray-0)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "transparent";
                                }}
                              >
                                <Text size="sm">{topic.name}</Text>
                              </Box>
                            ))
                          ) : (
                            <Box p="xs">
                              <Text size="sm" c="dimmed">
                                No more topics available
                              </Text>
                            </Box>
                          )}
                        </Stack>
                      </Paper>
                    )}
                  </Box>
                  <Divider />
                  <Box
                    p="xs"
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      position: "relative",
                    }}
                    onMouseEnter={() => setShowTransformSubmenu(true)}
                    onMouseLeave={() => setShowTransformSubmenu(false)}
                  >
                    <Text size="sm">Add Transformation</Text>
                    <IconChevronRight size={14} />

                    {/* Transformation Submenu */}
                    {showTransformSubmenu && (
                      <Paper
                        shadow="md"
                        p={0}
                        style={{
                          position: "absolute",
                          left: "100%",
                          top: 0,
                          minWidth: 200,
                          zIndex: 1001,
                        }}
                        onMouseEnter={() => setShowTransformSubmenu(true)}
                        onMouseLeave={() => setShowTransformSubmenu(false)}
                      >
                        <Stack gap={0} style={{ maxHeight: "400px", overflowY: "auto" }}>
                          {transformations &&
                            Object.entries(transformations).map(
                              ([category, categoryData]) => {
                                const Icon = getTransformationIcon(category);
                                return (
                                  <Box key={category}>
                                    <Box
                                      p="xs"
                                      style={{
                                        backgroundColor:
                                          colorScheme === "dark"
                                            ? "var(--mantine-color-dark-7)"
                                            : "var(--mantine-color-gray-1)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      <Group gap="xs">
                                        <Icon size={14} />
                                        <Text size="xs" fw={600}>
                                          {category}
                                        </Text>
                                      </Group>
                                    </Box>
                                    {categoryData.functions
                                      .slice(0, 5)
                                      .map((func: any) => (
                                        <Box
                                          key={func.name}
                                          p="xs"
                                          pl="lg"
                                          style={{
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                          }}
                                          onClick={() =>
                                            handleAddTransformationComponent(
                                              category,
                                              func.name,
                                            )
                                          }
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor =
                                              colorScheme === "dark"
                                                ? "var(--mantine-color-dark-6)"
                                                : "var(--mantine-color-gray-0)";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor =
                                              "transparent";
                                          }}
                                        >
                                          <Text size="xs">{func.name}</Text>
                                        </Box>
                                      ))}
                                    {categoryData.functions.length > 5 && (
                                      <Box
                                        p="xs"
                                        pl="lg"
                                        style={{
                                          fontStyle: "italic",
                                        }}
                                      >
                                        <Text size="xs" c="dimmed">
                                          +{categoryData.functions.length - 5}{" "}
                                          more...
                                        </Text>
                                      </Box>
                                    )}
                                  </Box>
                                );
                              },
                            )}
                          {!transformations && (
                            <Box p="xs">
                              <Text size="sm" c="dimmed">
                                Loading transformations...
                              </Text>
                            </Box>
                          )}
                        </Stack>
                      </Paper>
                    )}
                  </Box>
                </Stack>
              </Paper>
            </>
          )}

          {/* Canvas Content - Absolute positioned elements */}
          <Box
            data-canvas-content
            style={{
              position: "relative",
              minHeight: "1000px",
              minWidth: "1200px",
              paddingTop: "60px",
            }}
          >
            {/* Topics - Absolute positioned */}
            {selectedTopics.map((topicId, index) => {
              const topic = getTopicInfo(topicId);
              const schema = getTopicFields(topicId);
              const expanded = expandedTopics[topicId];
              const position = topicPositions[topicId] || {
                x: 50,
                y: 100 + index * 250,
              };

              return (
                <Card
                  key={topicId}
                  ref={(el) => {
                    topicCardRefs.current[topicId] = el;
                  }}
                  withBorder
                  shadow="sm"
                  p="md"
                  style={{
                    position: "absolute",
                    left: position.x,
                    top: position.y,
                    width: "400px",
                    cursor: draggingTopic === topicId ? "grabbing" : "grab",
                    zIndex: draggingTopic === topicId ? 100 : 2,
                  }}
                  onMouseDown={(e) => handleTopicMouseDown(topicId, e)}
                >
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        onClick={() => toggleTopicExpanded(topicId)}
                      >
                        {expanded ? (
                          <IconChevronDown size={16} />
                        ) : (
                          <IconChevronRight size={16} />
                        )}
                      </ActionIcon>
                      <Text fw={600}>{topic?.name}</Text>
                    </Group>
                    <ActionIcon
                      size="sm"
                      color="red"
                      variant="subtle"
                      onClick={() => handleRemoveTopic(topicId)}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>

                  {/* Revision Selector */}
                  {topic?.revisions && topic.revisions.length > 0 && (
                    <MultiSelect
                      label="Revisions"
                      size="xs"
                      value={topicRevisions[topicId] || []}
                      onChange={(values) => {
                        setTopicRevisions({
                          ...topicRevisions,
                          [topicId]: values,
                        });
                        // Clear any field mappings for this topic since schema might have changed
                        setFieldMappings(
                          fieldMappings.filter((m) => m.topicId !== topicId),
                        );
                      }}
                      data={topic.revisions.map((rev: any) => ({
                        value: String(rev.id),
                        label: `Rev ${rev.revision_number}${rev.change_description ? `: ${rev.change_description}` : ""}`,
                      }))}
                      placeholder="Select revisions..."
                      clearable
                      searchable
                      mb="xs"
                    />
                  )}

                  {topic?.description && (
                    <Text size="sm" c="dimmed" mb="xs">
                      {topic.description}
                    </Text>
                  )}

                  <Collapse in={expanded}>
                    <Divider my="xs" />
                    <Text size="xs" c="dimmed" mb="xs">
                      Columns - drag handle to map
                    </Text>
                    <Stack gap={4}>
                      {schema.map((col: any) => {
                        const mappedCount = fieldMappings.filter(
                          (m) =>
                            m.topicId === topicId && m.topicField === col.name,
                        ).length;
                        const colKey = `${topicId}-${col.name}`;
                        const selectedRevisionIds =
                          topicRevisions[topicId] || [];

                        return (
                          <Paper
                            key={col.name}
                            ref={(el) => {
                              topicColRefs.current[colKey] = el;
                            }}
                            p="xs"
                            withBorder
                            bg={
                              mappedCount > 0
                                ? colorScheme === "dark"
                                  ? "green.9"
                                  : "green.0"
                                : undefined
                            }
                          >
                            <Group justify="space-between" wrap="nowrap">
                              <Box style={{ flex: 1 }}>
                                <Group gap={4} wrap="nowrap">
                                  <Text size="sm" fw={500}>
                                    {col.name}
                                  </Text>
                                  {col.description && (
                                    <Tooltip
                                      label={col.description}
                                      position="top"
                                      withArrow
                                      multiline
                                      w={200}
                                    >
                                      <Box
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                        }}
                                      >
                                        <IconInfoCircle
                                          size={14}
                                          style={{ color: "#228be6" }}
                                        />
                                      </Box>
                                    </Tooltip>
                                  )}
                                  {col.revisionCount &&
                                    col.revisionCount <
                                      selectedRevisionIds.length && (
                                      <Tooltip
                                        label={`Present in revisions: ${col.revisionNumbers.join(", ")}`}
                                        position="top"
                                      >
                                        <Badge
                                          size="xs"
                                          color="orange"
                                          variant="filled"
                                        >
                                          {col.revisionCount}/
                                          {selectedRevisionIds.length}
                                        </Badge>
                                      </Tooltip>
                                    )}
                                </Group>
                                <Text size="xs" c="dimmed">
                                  {col.data_type}
                                </Text>
                              </Box>
                              <ActionIcon
                                size="lg"
                                variant="light"
                                color="blue"
                                draggable
                                onDragStart={() =>
                                  handleColumnDragStart(topicId, col.name)
                                }
                                onDragEnd={handleColumnDragEnd}
                                style={{ cursor: "grab" }}
                                title="Drag to map to model field"
                              >
                                <IconGripVertical size={18} />
                              </ActionIcon>
                            </Group>
                            {mappedCount > 0 && (
                              <Badge size="xs" color="green" mt={4}>
                                {mappedCount} mapping
                                {mappedCount > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Collapse>
                </Card>
              );
            })}

            {/* Model - Absolute positioned on the right */}
            <Card
              withBorder
              shadow="lg"
              p="md"
              style={{
                position: "absolute",
                left: modelPosition.x,
                top: modelPosition.y,
                width: "400px",
                cursor: draggingModel ? "grabbing" : "grab",
                zIndex: draggingModel ? 100 : 2,
              }}
              onMouseDown={handleModelMouseDown}
            >
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={700} size="lg">
                    {entityName}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Data Model
                  </Text>
                </div>
                <Button
                  size="sm"
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={handleAddModelField}
                >
                  Add Field
                </Button>
              </Group>

              <Divider mb="md" />

              <Stack gap="xs">
                {modelFields.length === 0 ? (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Click "Add Field" to create fields
                  </Text>
                ) : (
                  modelFields.map((fieldName) => {
                    const mappings = fieldMappings.filter(
                      (m) => m.modelField === fieldName,
                    );
                    // Also check if field has hash connections
                    const hasHashConnection = hashConnections.some(
                      (c) =>
                        c.targetType === "model" && c.targetField === fieldName,
                    );
                    const isEditing = editingField === fieldName;

                    // Check if this is a system/readonly field
                    const isSystemField = SYSTEM_FIELDS.includes(fieldName);

                    return (
                      <Paper
                        key={fieldName}
                        ref={(el) => {
                          modelFieldRefs.current[fieldName] = el;
                        }}
                        p="sm"
                        withBorder
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleFieldDrop(fieldName)}
                        bg={
                          isSystemField
                            ? colorScheme === "dark"
                              ? "gray.9"
                              : "gray.1"
                            : mappings.length > 0 || hasHashConnection
                              ? colorScheme === "dark"
                                ? "blue.9"
                                : "blue.0"
                              : undefined
                        }
                        style={{
                          border:
                            (draggedColumn || draggedFromHash) &&
                            mappings.length === 0 &&
                            !hasHashConnection
                              ? draggedFromHash
                                ? "2px dashed var(--mantine-color-green-5)"
                                : "2px dashed var(--mantine-color-blue-5)"
                              : undefined,
                          opacity: isSystemField ? 0.7 : 1,
                        }}
                      >
                        <Group justify="space-between" align="flex-start">
                          <Box style={{ flex: 1 }}>
                            <Group gap="xs" mb={4}>
                              {isEditing && !isSystemField ? (
                                <TextInput
                                  size="sm"
                                  value={editingFieldValue}
                                  onChange={(e) =>
                                    setEditingFieldValue(e.target.value)
                                  }
                                  onBlur={handleFinishEditField}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleFinishEditField();
                                    } else if (e.key === "Escape") {
                                      handleCancelEditField();
                                    }
                                  }}
                                  autoFocus
                                  styles={{ input: { fontWeight: 600 } }}
                                />
                              ) : (
                                <>
                                  <Text size="sm" fw={600}>
                                    {fieldName}
                                  </Text>
                                  {!isSystemField && (
                                    <ActionIcon
                                      size="xs"
                                      variant="subtle"
                                      onClick={() =>
                                        handleStartEditField(fieldName)
                                      }
                                      title="Edit field name"
                                    >
                                      <IconEdit size={12} />
                                    </ActionIcon>
                                  )}
                                  {isSystemField && (
                                    <Badge
                                      size="xs"
                                      color="gray"
                                      variant="light"
                                    >
                                      system
                                    </Badge>
                                  )}
                                </>
                              )}
                              {mappings.length === 0 &&
                                !hasHashConnection &&
                                !isEditing &&
                                !isSystemField && (
                                  <Badge
                                    size="xs"
                                    color="gray"
                                    variant="outline"
                                  >
                                    unmapped
                                  </Badge>
                                )}
                            </Group>

                            {/* Data Type Selector */}
                            {!isEditing && (
                              <Select
                                size="xs"
                                value={modelFieldTypes[fieldName] || "string"}
                                onChange={(value) => {
                                  if (value) {
                                    setModelFieldTypes({
                                      ...modelFieldTypes,
                                      [fieldName]: value,
                                    });
                                  }
                                }}
                                data={[
                                  { value: "string", label: "String" },
                                  { value: "integer", label: "Integer" },
                                  { value: "float", label: "Float" },
                                  { value: "boolean", label: "Boolean" },
                                  { value: "date", label: "Date" },
                                  { value: "datetime", label: "DateTime" },
                                  { value: "timestamp", label: "Timestamp" },
                                  { value: "json", label: "JSON" },
                                ]}
                                placeholder="Data type"
                                mb="xs"
                              />
                            )}

                            {mappings.length > 0 && (
                              <Stack gap={4}>
                                {mappings.map((mapping, idx) => {
                                  const topic = getTopicInfo(mapping.topicId);
                                  return (
                                    <Group key={idx} gap="xs">
                                      <Badge
                                        size="sm"
                                        variant="light"
                                        pr={3}
                                        rightSection={
                                          <ActionIcon
                                            size="xs"
                                            color="gray"
                                            radius="xl"
                                            variant="transparent"
                                            onClick={() =>
                                              handleRemoveMapping(mapping)
                                            }
                                          >
                                            <IconX size={10} />
                                          </ActionIcon>
                                        }
                                      >
                                        {topic?.name}.{mapping.topicField}
                                      </Badge>
                                    </Group>
                                  );
                                })}
                              </Stack>
                            )}
                          </Box>
                          {!isSystemField && (
                            <ActionIcon
                              size="sm"
                              color="red"
                              variant="subtle"
                              onClick={() => handleRemoveModelField(fieldName)}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      </Paper>
                    );
                  })
                )}
              </Stack>
            </Card>

            {/* Hash Components - Absolute positioned */}
            {hashComponents.map((hashComp) => {
              return (
                <Box
                  key={hashComp.id}
                  style={{
                    position: "absolute",
                    left: hashComp.position.x,
                    top: hashComp.position.y,
                    width: "200px",
                    zIndex: draggingHash === hashComp.id ? 100 : 3,
                  }}
                >
                  <Card
                    withBorder
                    shadow="md"
                    p="xs"
                    style={{
                      cursor:
                        draggingHash === hashComp.id ? "grabbing" : "grab",
                      position: "relative",
                    }}
                    onMouseDown={(e) => {
                      // Don't start dragging if clicking on a connection node
                      const target = e.target as HTMLElement;
                      if (target.hasAttribute("data-connection-node")) {
                        return;
                      }
                      if (!canvasRef.current) return;
                      const canvasRect =
                        canvasRef.current.getBoundingClientRect();
                      setDraggingHash(hashComp.id);
                      setDragOffset({
                        x:
                          e.clientX -
                          canvasRect.left -
                          hashComp.position.x +
                          canvasRef.current.scrollLeft,
                        y:
                          e.clientY -
                          canvasRect.top -
                          hashComp.position.y +
                          canvasRef.current.scrollTop,
                      });
                    }}
                  >
                    {/* Input Connection Node (Left) */}
                    <Box
                      ref={(el) => {
                        if (!hashNodeRefs.current[hashComp.id]) {
                          hashNodeRefs.current[hashComp.id] = {
                            input: null,
                            output: null,
                          };
                        }
                        hashNodeRefs.current[hashComp.id].input = el;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleHashInputDrop(hashComp.id);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation(); // Prevent card drag when clicking input node
                      }}
                      style={{
                        position: "absolute",
                        left: -8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: draggedToHash
                          ? "#4dabf7"
                          : colorScheme === "dark"
                            ? "#4dabf7"
                            : "#1c7ed6",
                        border: draggedToHash
                          ? "3px solid #ffd43b"
                          : "2px solid white",
                        cursor: "crosshair",
                        zIndex: 10,
                        transition: "all 0.2s ease",
                      }}
                      data-connection-node="true"
                      title="Drop topic field here to connect"
                    />

                    {/* Output Connection Node (Right) */}
                    <Box
                      ref={(el) => {
                        if (!hashNodeRefs.current[hashComp.id]) {
                          hashNodeRefs.current[hashComp.id] = {
                            input: null,
                            output: null,
                          };
                        }
                        hashNodeRefs.current[hashComp.id].output = el;
                      }}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleHashOutputDragStart(hashComp.id);
                      }}
                      onDragEnd={(e) => {
                        e.stopPropagation();
                        handleHashOutputDragEnd();
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation(); // Prevent card drag when clicking output node
                      }}
                      style={{
                        position: "absolute",
                        right: -8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background:
                          colorScheme === "dark" ? "#51cf66" : "#2f9e44",
                        border: "2px solid white",
                        cursor: "grab",
                        zIndex: 10,
                      }}
                      data-connection-node="true"
                      title="Drag to model field to connect"
                    />

                    <Group justify="space-between" mb="xs">
                      <Group gap="xs">
                        <IconHash size={16} />
                        <Text fw={600} size="sm">
                          Hash
                        </Text>
                      </Group>
                      <ActionIcon
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHashComponents(
                            hashComponents.filter((h) => h.id !== hashComp.id),
                          );
                        }}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>

                    <Select
                      size="xs"
                      value={hashComp.hashMethod}
                      onChange={(value) => {
                        setHashComponents(
                          hashComponents.map((h) =>
                            h.id === hashComp.id
                              ? { ...h, hashMethod: value || "MD5" }
                              : h,
                          ),
                        );
                      }}
                      data={[
                        { value: "MD5", label: "MD5" },
                        { value: "SHA-1", label: "SHA-1" },
                        { value: "SHA-256", label: "SHA-256" },
                      ]}
                      styles={{
                        input: {
                          minHeight: "28px",
                        },
                      }}
                    />
                  </Card>
                </Box>
              );
            })}

            {/* Transformation Components - Absolute positioned */}
            {transformationComponents.map((transformComp) => {
              const Icon = getTransformationIcon(transformComp.category);
              return (
                <Box
                  key={transformComp.id}
                  style={{
                    position: "absolute",
                    left: transformComp.position.x,
                    top: transformComp.position.y,
                    width: "220px",
                    zIndex: draggingTransform === transformComp.id ? 100 : 3,
                  }}
                >
                  <Card
                    withBorder
                    shadow="md"
                    p="xs"
                    style={{
                      cursor:
                        draggingTransform === transformComp.id
                          ? "grabbing"
                          : "grab",
                      position: "relative",
                      backgroundColor:
                        colorScheme === "dark"
                          ? "var(--mantine-color-dark-6)"
                          : "white",
                    }}
                    onMouseDown={(e) => {
                      // Don't start dragging if clicking on input elements
                      const target = e.target as HTMLElement;
                      if (
                        target.tagName === "INPUT" ||
                        target.tagName === "SELECT" ||
                        target.closest(".mantine-Select-input") ||
                        target.closest(".mantine-NumberInput-input")
                      ) {
                        return;
                      }
                      if (!canvasRef.current) return;
                      const canvasRect =
                        canvasRef.current.getBoundingClientRect();
                      setDraggingTransform(transformComp.id);
                      setDragOffset({
                        x:
                          e.clientX -
                          canvasRect.left -
                          transformComp.position.x +
                          canvasRef.current.scrollLeft,
                        y:
                          e.clientY -
                          canvasRect.top -
                          transformComp.position.y +
                          canvasRef.current.scrollTop,
                      });
                    }}
                  >
                    <Group justify="space-between" mb="xs">
                      <Group gap="xs">
                        <Icon size={18} />
                        <Box>
                          <Text fw={600} size="sm">
                            {transformComp.transformationType}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {transformComp.category}
                          </Text>
                        </Box>
                      </Group>
                      <ActionIcon
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTransformationComponents(
                            transformationComponents.filter(
                              (t) => t.id !== transformComp.id,
                            ),
                          );
                        }}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>

                    {/* Parameter inputs based on transformation type */}
                    {transformComp.transformationType === "ROUND" && (
                      <NumberInput
                        label="Decimals"
                        size="xs"
                        value={transformComp.params.decimals || 0}
                        onChange={(value) => {
                          setTransformationComponents(
                            transformationComponents.map((t) =>
                              t.id === transformComp.id
                                ? {
                                    ...t,
                                    params: { ...t.params, decimals: value },
                                  }
                                : t,
                            ),
                          );
                        }}
                        min={0}
                        max={10}
                      />
                    )}
                    {transformComp.transformationType === "SUBSTRING" && (
                      <Stack gap="xs">
                        <NumberInput
                          label="Start"
                          size="xs"
                          value={transformComp.params.start || 0}
                          onChange={(value) => {
                            setTransformationComponents(
                              transformationComponents.map((t) =>
                                t.id === transformComp.id
                                  ? {
                                      ...t,
                                      params: { ...t.params, start: value },
                                    }
                                  : t,
                              ),
                            );
                          }}
                        />
                        <NumberInput
                          label="Length"
                          size="xs"
                          value={transformComp.params.length || 10}
                          onChange={(value) => {
                            setTransformationComponents(
                              transformationComponents.map((t) =>
                                t.id === transformComp.id
                                  ? {
                                      ...t,
                                      params: { ...t.params, length: value },
                                    }
                                  : t,
                              ),
                            );
                          }}
                        />
                      </Stack>
                    )}
                    {(transformComp.transformationType === "ADD" ||
                      transformComp.transformationType === "SUBTRACT" ||
                      transformComp.transformationType === "MULTIPLY" ||
                      transformComp.transformationType === "DIVIDE") && (
                      <NumberInput
                        label="Value"
                        size="xs"
                        value={transformComp.params.value || 0}
                        onChange={(value) => {
                          setTransformationComponents(
                            transformationComponents.map((t) =>
                              t.id === transformComp.id
                                ? {
                                    ...t,
                                    params: { ...t.params, value: value },
                                  }
                                : t,
                            ),
                          );
                        }}
                      />
                    )}
                    {transformComp.transformationType === "HASH" && (
                      <Select
                        label="Algorithm"
                        size="xs"
                        value={transformComp.params.algorithm || "MD5"}
                        onChange={(value) => {
                          setTransformationComponents(
                            transformationComponents.map((t) =>
                              t.id === transformComp.id
                                ? {
                                    ...t,
                                    params: {
                                      ...t.params,
                                      algorithm: value || "MD5",
                                    },
                                  }
                                : t,
                            ),
                          );
                        }}
                        data={[
                          { value: "MD5", label: "MD5" },
                          { value: "SHA256", label: "SHA-256" },
                          { value: "SHA512", label: "SHA-512" },
                        ]}
                      />
                    )}
                    {transformComp.transformationType === "CAST" && (
                      <Select
                        label="Target Type"
                        size="xs"
                        value={transformComp.params.targetType || "INTEGER"}
                        onChange={(value) => {
                          setTransformationComponents(
                            transformationComponents.map((t) =>
                              t.id === transformComp.id
                                ? {
                                    ...t,
                                    params: {
                                      ...t.params,
                                      targetType: value || "INTEGER",
                                    },
                                  }
                                : t,
                            ),
                          );
                        }}
                        data={[
                          { value: "INTEGER", label: "Integer" },
                          { value: "FLOAT", label: "Float" },
                          { value: "STRING", label: "String" },
                          { value: "BOOLEAN", label: "Boolean" },
                          { value: "DATE", label: "Date" },
                          { value: "DATETIME", label: "DateTime" },
                        ]}
                      />
                    )}

                    <Badge size="xs" mt="xs" variant="light">
                      Drag to field to apply
                    </Badge>
                  </Card>
                </Box>
              );
            })}
          </Box>

          {/* SVG overlay for connection lines */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              overflow: "visible",
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3, 0 6"
                  fill={colorScheme === "dark" ? "#4dabf7" : "#1c7ed6"}
                />
              </marker>
              <marker
                id="arrowhead-green"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3, 0 6"
                  fill={colorScheme === "dark" ? "#51cf66" : "#2f9e44"}
                />
              </marker>
            </defs>
            {connectionLines.map((line, idx) => (
              <g key={idx}>
                <path
                  d={line.path}
                  stroke={
                    line.color ||
                    (colorScheme === "dark" ? "#4dabf7" : "#1c7ed6")
                  }
                  strokeWidth="2"
                  fill="none"
                  markerEnd={
                    line.type === "hash-model"
                      ? "url(#arrowhead-green)"
                      : "url(#arrowhead)"
                  }
                />
                {/* Delete button on connection line */}
                {line.id && (
                  <g
                    style={{ pointerEvents: "all", cursor: "pointer" }}
                    onClick={() => {
                      if (!line.id) return;
                      if (line.type === "topic-model") {
                        // Extract mapping info from id
                        const [topicId, topicField, modelField] =
                          line.id.split("-");
                        const mapping = fieldMappings.find(
                          (m) =>
                            m.topicId === topicId &&
                            m.topicField === topicField &&
                            m.modelField === modelField,
                        );
                        if (mapping) handleRemoveMapping(mapping);
                      } else if (
                        line.type === "topic-hash" ||
                        line.type === "hash-model"
                      ) {
                        handleRemoveHashConnection(line.id);
                      }
                    }}
                  >
                    <circle
                      cx={line.midX}
                      cy={line.midY}
                      r="10"
                      fill={colorScheme === "dark" ? "#2c2e33" : "#ffffff"}
                      stroke={
                        line.color ||
                        (colorScheme === "dark" ? "#4dabf7" : "#1c7ed6")
                      }
                      strokeWidth="2"
                    />
                    <line
                      x1={line.midX - 4}
                      y1={line.midY - 4}
                      x2={line.midX + 4}
                      y2={line.midY + 4}
                      stroke="#fa5252"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1={line.midX + 4}
                      y1={line.midY - 4}
                      x2={line.midX - 4}
                      y2={line.midY + 4}
                      stroke="#fa5252"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                )}
              </g>
            ))}
          </svg>
        </Box>
      </Stack>
    </>
  );
}
