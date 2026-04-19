import type { AvailableModelRecord } from './contracts';

export const dedupeAndSortModels = (
  models: AvailableModelRecord[],
  fallbackModelIds: string[],
): AvailableModelRecord[] => {
  const seen = new Set<string>();
  const merged = [
    ...models,
    ...fallbackModelIds.map((id) => ({
      id,
    })),
  ];

  return merged
    .filter((model) => {
      const id = model.id.trim();
      if (!id || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: 'base' }));
};
