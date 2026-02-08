# Frontend Architecture

This document describes the frontend architecture and best practices after the comprehensive refactor.

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TanStack Query (React Query)** - Data fetching and caching
- **Zustand** - Lightweight state management (auth only)
- **Mantine UI** - Component library
- **React Router v7** - Routing
- **Sentry** - Error tracking and performance monitoring

## Project Structure

```
frontend/src/
├── app/                    # Application shell
│   ├── AppShellLayout.tsx  # Main layout with navigation
│   └── router.tsx          # Route configuration
├── components/
│   └── common/             # Reusable components
│       ├── ErrorBoundary.tsx       # Error boundary wrapper
│       ├── KeyValueEditor.tsx      # Key-value pair editor
│       ├── PageHeader.tsx          # Page header with title/action
│       └── SchemaColumnEditor.tsx  # Schema column editor
├── features/               # Feature-specific components
│   ├── connections/        # Storage backend wizards/cards
│   ├── models/            # Data modeling components
│   └── sources/           # Data source drawers
├── hooks/                 # Custom React Query hooks
│   ├── useDataSources.ts
│   ├── useStreams.ts
│   ├── useTopics.ts
│   ├── usePackages.ts
│   ├── useModels.ts
│   ├── useRuns.ts
│   └── useStorageBackends.ts
├── lib/                   # Configuration and setup
│   └── queryClient.ts     # TanStack Query configuration
├── pages/                 # Page components
│   ├── DashboardPage.tsx
│   ├── DataSourcesPage.tsx
│   ├── StreamsPage.tsx
│   ├── TopicsPage.tsx
│   ├── ModelsPage.tsx
│   ├── RunsPage.tsx
│   ├── SettingsPage.tsx
│   └── LoginPage.tsx
├── store/                 # Zustand stores
│   ├── useAuthStore.ts    # Authentication state
│   └── useAppStore.ts     # Legacy store (being phased out)
└── utils/                 # Utility functions
    ├── api.ts             # API client wrapper
    ├── logger.ts          # Centralized logging
    ├── storage.ts         # LocalStorage helpers
    ├── url.ts             # URL utilities
    └── schemaInfer.ts     # Schema inference

```

## Data Fetching Pattern

### TanStack Query Hooks

All data fetching is handled through custom hooks in the `hooks/` directory. These hooks provide:

- **Automatic caching** - Data is cached for 5 minutes by default
- **Cache invalidation** - Mutations automatically invalidate related queries
- **Loading states** - `isLoading`, `isFetching` states
- **Error handling** - Errors are caught and displayed via notifications
- **Optimistic updates** - UI updates immediately with rollback on error

**Example Usage:**

```tsx
import { useDataSources, useCreateDataSource } from '../hooks/useDataSources';

function DataSourcesPage() {
  const { data: dataSources = [], isLoading } = useDataSources();
  const createDataSource = useCreateDataSource();

  const handleCreate = (data: any) => {
    createDataSource.mutate(data); // Automatic notification + cache invalidation
  };

  return (
    <div>
      {isLoading ? <Loader /> : <Table data={dataSources} />}
    </div>
  );
}
```

### Query Keys

Query keys follow a consistent pattern:
- `['dataSources']` - List of data sources
- `['dataSources', id]` - Single data source
- `['streams']` - List of streams
- `['packages', revisionId]` - Packages for a specific revision

## Reusable Components

### PageHeader

Standardized page header with title, description, and optional action button.

```tsx
<PageHeader
  title="Data Sources"
  description="Configure connections to APIs, databases, and more"
  action={{
    label: "Add Data Source",
    onClick: openDrawer,
    icon: <IconPlus size={16} />,
  }}
/>
```

### SchemaColumnEditor

Reusable component for editing table schemas with add/remove/update operations.

```tsx
const [columns, setColumns] = useState<SchemaColumn[]>([]);

<SchemaColumnEditor columns={columns} onChange={setColumns} />
```

### KeyValueEditor

Reusable component for editing key-value pairs (headers, query params, etc.).

```tsx
const [pairs, setPairs] = useState<KeyValuePair[]>([]);

<KeyValueEditor 
  pairs={pairs} 
  onChange={setPairs}
  keyPlaceholder="Header Name"
  valuePlaceholder="Header Value"
/>
```

### ErrorBoundary

Top-level error boundary that catches React errors and displays a user-friendly message.

```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

## Error Handling

### Centralized Logger

Use the logging utility for consistent error tracking:

```tsx
import { logError, logWarning, logInfo } from '../utils/logger';

try {
  await api.dataSources.create(data);
  logInfo('Data source created', { name: data.name });
} catch (error) {
  logError(error, {
    action: 'create_data_source',
    resource: 'data_source',
    additionalData: { name: data.name },
  });
}
```

### Error Notifications

Mutations automatically show notifications on success/error:

```tsx
// In hooks/useDataSources.ts
export function useCreateDataSource() {
  return useMutation({
    mutationFn: (data) => api.dataSources.create(data),
    onSuccess: () => {
      notifications.show({
        message: "Data source created successfully",
        color: "teal",
      });
    },
    onError: (error) => {
      notifications.show({
        message: error.message || "Failed to create data source",
        color: "red",
      });
    },
  });
}
```

## Performance Optimizations

1. **Selective Data Fetching** - Each page only fetches the data it needs
2. **Query Caching** - Avoid redundant API calls with 5-minute cache
3. **Automatic Refetch** - Data refreshes when window regains focus (disabled by default)
4. **Cache Invalidation** - Mutations invalidate related queries automatically
5. **Loading States** - Proper loading indicators prevent layout shift

## Best Practices

### DO:
- ✅ Use custom hooks from `hooks/` for all data fetching
- ✅ Use reusable components from `components/common/`
- ✅ Add loading states for all async operations
- ✅ Use the centralized logger for errors
- ✅ Follow the PageHeader pattern for all pages
- ✅ Handle errors with notifications

### DON'T:
- ❌ Don't call `api.*` directly in components (use hooks)
- ❌ Don't manually manage loading states (let React Query handle it)
- ❌ Don't use `useEffect` for data fetching (use React Query)
- ❌ Don't duplicate schema/KV editor logic (use reusable components)
- ❌ Don't ignore TypeScript errors
- ❌ Don't use `console.log` in production (use logger utility)

## Future Improvements

- [ ] Add pagination for large data sets
- [ ] Implement lazy loading for drawers and wizards
- [ ] Add React.memo for expensive components
- [ ] Create a shared types package
- [ ] Add integration tests with React Testing Library
- [ ] Implement optimistic updates for better UX
- [ ] Add service worker for offline support
