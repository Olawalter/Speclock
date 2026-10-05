/**
 * The regression this exists for: a page stuck on "Reading this assessment from
 * the contract…" forever, in a tab that was in the background when it changed
 * what it was asking for. Nothing in the interface recovered when the tab came
 * back, because the skipped read had nothing to trigger it again.
 */
import { describe, expect, it } from "vitest";

import { skipRead } from "./polling";

const KEY = "get_assessment:[\"A5\"]:false";
const OTHER = "get_assessment:[\"A6\"]:false";

describe("when a read may be skipped", () => {
  it("skips refreshing an answer already on the page while nobody is looking", () => {
    expect(skipRead({ key: KEY, loadedKey: KEY, hidden: true })).toBe(true);
  });

  it("reads anyway when the page is asking for something it does not have", () => {
    // The bug: this was skipped because the hook had loaded *something* before.
    expect(skipRead({ key: OTHER, loadedKey: KEY, hidden: true })).toBe(false);
  });

  it("reads the first time, hidden or not", () => {
    expect(skipRead({ key: KEY, loadedKey: "", hidden: true })).toBe(false);
    expect(skipRead({ key: KEY, loadedKey: "", hidden: false })).toBe(false);
  });

  it("never skips while somebody is looking at it", () => {
    expect(skipRead({ key: KEY, loadedKey: KEY, hidden: false })).toBe(false);
  });

  it("does not treat two pages with nothing loaded as the same page", () => {
    expect(skipRead({ key: "", loadedKey: "", hidden: true })).toBe(false);
  });
});
