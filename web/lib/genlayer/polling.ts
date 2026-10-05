/**
 * When a read may be skipped.
 *
 * Its own module, and its own test, because the version of this that lived
 * inside the hook was wrong in a way nothing noticed: it skipped on "has this
 * hook ever loaded" rather than "has it loaded *this*", so a page that changed
 * what it was asking for while the tab was in the background never read at all,
 * and had nothing to trigger it again when the tab came back.
 */
export function skipRead({ key, loadedKey, hidden }: {
  key: string;
  loadedKey: string;
  hidden: boolean;
}): boolean {
  // Refreshing something already in hand while nobody is looking: skip it. Any
  // other case is a read whose answer is not on the screen yet, and a hidden
  // tab is not a reason to leave a page loading forever.
  return hidden && loadedKey === key && key !== "";
}
