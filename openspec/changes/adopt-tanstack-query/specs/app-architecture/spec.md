## ADDED Requirements

### Requirement: Server state SHALL be owned by TanStack Query

Server state (remote reads and writes) SHALL be owned by TanStack Query (React Query) v5, not by
hand-rolled per-Context fetching. Remote reads SHALL be exposed as `useQuery` with stable query
keys (cached, de-duplicated, background-refetched); remote writes SHALL be `useMutation` that
invalidate the affected query keys. A `QueryClientProvider` SHALL sit in the app provider chain
(its order is load-bearing and covered by the App smoke test). The `SdkActionResult` discriminated
result SHALL remain the SDK-boundary shape a `queryFn` adapts (return data, or throw on failure);
per-widget hand-rolled load/cancel state (`loadSeqRef`) SHALL be removed in favor of the query
lifecycle. Client state (UI toggles, forms, preferences, chat/session stores) SHALL stay in the
existing contexts — TanStack Query is for server state only. New server reads SHALL go through the
query layer rather than `useEffect` + fetch, enforced by a guard.

#### Scenario: A remounted reader is a cache hit, not a refetch

- **GIVEN** a component that read a document's data via `useQuery` under a stable key
- **WHEN** the component unmounts and a sibling remounts requesting the same key within `staleTime`
- **THEN** the cached data is returned immediately with no new network request
- **AND** no loading state is shown on the remount.

#### Scenario: Concurrent readers share one request

- **GIVEN** two components request the same query key before it resolves
- **WHEN** both are pending
- **THEN** TanStack Query issues a single in-flight request and both receive its result.

#### Scenario: A mutation invalidates the affected keys

- **GIVEN** a document whose reads are cached
- **WHEN** that document is ingested, crawled, copied, updated, or deleted via `useMutation`
- **THEN** the mutation invalidates the affected document query keys
- **AND** the next read refetches those keys while unrelated keys stay cached.

#### Scenario: The provider chain still mounts

- **GIVEN** the app provider chain with `QueryClientProvider` added
- **WHEN** the App smoke test mounts the app
- **THEN** the app renders without a provider-order error.

#### Scenario: New server reads go through the query layer

- **GIVEN** the codebase after migration
- **WHEN** the guard scans for server reads
- **THEN** server reads resolve through `useQuery`/`useMutation`, not new `useEffect` + fetch calls
- **AND** no two code paths fetch the same server data (the parallel `useLiveExtract` chain is
  consolidated onto the same query hooks, or explicitly grandfathered with a written reason).

#### Scenario: Transient failures retry, parse errors fail fast

- **GIVEN** a `queryFn` that fetches over the network then validates the payload
- **WHEN** the fetch fails transiently (network / 5xx)
- **THEN** the retry predicate re-fetches up to the configured limit
- **AND** WHEN the payload is malformed (a parse/validation error) or the server returns 4xx, the
  query fails fast with no re-fetch (preserving the hand-rolled X-Ray network-only retry).

#### Scenario: A failed read is not cached

- **GIVEN** a read whose first load failed
- **WHEN** the reader unmounts and remounts for the same key
- **THEN** the query re-runs the fetch (errors are not cached), rather than serving a stale error.
