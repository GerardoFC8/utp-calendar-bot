import { logger } from '../logger.js';
import { insertChange } from '../db/queries.js';

// Use a loose object type so concrete entity types (ClassData, CourseData, TaskData)
// can be passed without requiring an explicit index signature.
type EntityWithId = Record<string, unknown> & { id: string };

export interface DiffResult {
  added: EntityWithId[];
  removed: EntityWithId[];
  modified: Array<{
    entity: EntityWithId;
    changes: Record<string, { old: string; new: string }>;
  }>;
}

export function computeDiff(
  existing: EntityWithId[],
  scraped: EntityWithId[]
): DiffResult {
  const existingMap = new Map(existing.map((e) => [e.id, e]));
  const scrapedMap = new Map(scraped.map((s) => [s.id, s]));

  const added: EntityWithId[] = [];
  const removed: EntityWithId[] = [];
  const modified: DiffResult['modified'] = [];

  // Find added and modified
  for (const [id, scrapedEntity] of scrapedMap) {
    const existingEntity = existingMap.get(id);

    if (!existingEntity) {
      added.push(scrapedEntity);
      continue;
    }

    // Check for modifications
    const changes: Record<string, { old: string; new: string }> = {};
    const fieldsToCompare = Object.keys(scrapedEntity).filter(
      (k) => k !== 'id' && k !== 'createdAt' && k !== 'lastSeen'
    );

    for (const field of fieldsToCompare) {
      const oldVal = String(existingEntity[field] ?? '');
      const newVal = String(scrapedEntity[field] ?? '');

      if (oldVal !== newVal) {
        changes[field] = { old: oldVal, new: newVal };
      }
    }

    if (Object.keys(changes).length > 0) {
      modified.push({ entity: scrapedEntity, changes });
    }
  }

  // Find removed
  for (const [id, existingEntity] of existingMap) {
    if (!scrapedMap.has(id)) {
      removed.push(existingEntity);
    }
  }

  logger.info({
    added: added.length,
    removed: removed.length,
    modified: modified.length,
  }, 'Diff computed');

  return { added, removed, modified };
}

export function persistChanges(
  diff: DiffResult,
  entityType: 'class' | 'task' | 'course'
): void {
  for (const entity of diff.added) {
    insertChange({
      entityType,
      entityId: entity.id,
      changeType: 'added',
      newValue: JSON.stringify(entity),
    });
  }

  for (const entity of diff.removed) {
    insertChange({
      entityType,
      entityId: entity.id,
      changeType: 'removed',
      oldValue: JSON.stringify(entity),
    });
  }

  for (const { entity, changes } of diff.modified) {
    insertChange({
      entityType,
      entityId: entity.id,
      changeType: 'modified',
      oldValue: JSON.stringify(changes),
      newValue: JSON.stringify(entity),
    });
  }
}
