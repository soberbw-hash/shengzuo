export interface DeletedListItem<Item> {
  item: Item;
  index: number;
  replacement?: Item;
}

export const restoreDeletedItem = <Item extends { id: string }>(
  items: Item[],
  deletion: DeletedListItem<Item>,
  limit: number,
): Item[] => {
  if (items.some((item) => item.id === deletion.item.id)) return items;
  // Remove only the untouched empty placeholder. Keep any text entered into it.
  const remaining = items.filter((item) => item !== deletion.replacement);
  if (remaining.length >= limit) return items;
  const next = [...remaining];
  next.splice(Math.min(deletion.index, next.length), 0, deletion.item);
  return next;
};
