import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  restoreDeletedItem,
  type DeletedListItem,
} from "../lib/deletionRecovery";

export const useDeletionRecovery = <Item extends { id: string }>(
  items: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>,
  scope: string,
  limit: number,
  createEmpty?: () => Item,
) => {
  const [history, setHistory] = useState<{
    scope: string;
    entries: DeletedListItem<Item>[];
  }>({ scope, entries: [] });
  useEffect(() => {
    setHistory((current) =>
      current.scope === scope ? current : { scope, entries: [] },
    );
  }, [scope]);
  const entries = history.scope === scope ? history.entries : [];
  const latest = entries.at(-1);
  const canUndo = Boolean(
    latest &&
      (items.length < limit ||
        (latest.replacement && items.includes(latest.replacement))),
  );
  const remove = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    const item = items[index];
    if (!item) return;
    const replacement = items.length === 1 ? createEmpty?.() : undefined;
    setHistory((current) => ({
      scope,
      entries: [
        ...(current.scope === scope ? current.entries : []),
        { item, index, replacement },
      ],
    }));
    setItems((current) => {
      const remaining = current.filter((candidate) => candidate.id !== id);
      return remaining.length === 0 && replacement ? [replacement] : remaining;
    });
  };
  const undo = () => {
    if (!latest || !canUndo) return;
    setItems((current) => restoreDeletedItem(current, latest, limit));
    setHistory((current) => ({ scope, entries: current.entries.slice(0, -1) }));
  };
  const clear = useCallback(
    () => setHistory((current) => ({ ...current, entries: [] })),
    [],
  );
  return { remove, undo, canUndo, clear };
};
