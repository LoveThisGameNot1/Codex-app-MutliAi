import { describe, expect, it } from 'vitest';
import { dedupeAndSortModels } from '../../shared/model-catalog';

describe('model-catalog', () => {
  it('dedupes and alphabetizes live and fallback models together', () => {
    const result = dedupeAndSortModels(
      [
        { id: 'z-model', ownedBy: 'provider' },
        { id: 'a-model' },
        { id: 'z-model' },
      ],
      ['b-model', 'a-model'],
    );

    expect(result.map((model) => model.id)).toEqual(['a-model', 'b-model', 'z-model']);
  });

  it('drops empty model ids from the merged catalog', () => {
    const result = dedupeAndSortModels([{ id: '   ' }, { id: 'model-x' }], ['']);
    expect(result.map((model) => model.id)).toEqual(['model-x']);
  });
});
