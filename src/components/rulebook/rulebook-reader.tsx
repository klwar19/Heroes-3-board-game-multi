"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, List, Minus, Plus, Search, X } from "lucide-react";
import rulebookIndex from "@/data/rulebook/rulebook-index.json";
import { assetUrl } from "@/lib/asset-url";
import css from "./rulebook-reader.module.css";

/**
 * In-app reader for the community Heroes III board game rule book.
 *
 * The 43 MB source PDF is shipped as one lazily-loaded image per page (built by
 * scripts/rulebook/build-rulebook.mjs), so opening the book costs a few hundred
 * KB and only the pages you scroll to are fetched. The PDF's own outline drives
 * the Contents panel, its link annotations stay clickable, and the extracted
 * page text powers search (that JSON is loaded only when you first search).
 */

type RulebookLink = { x: number; y: number; w: number; h: number; page?: number; url?: string };
type RulebookPage = { n: number; w: number; h: number; src: string; links?: RulebookLink[] };
type OutlineItem = { title: string; page: number | null; children: OutlineItem[] };
type RulebookIndex = {
  source: string;
  builtAt: string;
  pageCount: number;
  pages: RulebookPage[];
  outline: OutlineItem[];
};

const INDEX = rulebookIndex as RulebookIndex;
const LAST_PAGE_KEY = "binh-rulebook-page";
const ZOOM_KEY = "binh-rulebook-zoom";
const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
/** Pages this far (in viewport heights) outside the visible area start loading. */
const PRELOAD_MARGIN = "150% 0px";

export const RULEBOOK_SOURCE_URL = INDEX.source;

function readNumber(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable — the reader still works, it just won't remember.
  }
}

type SearchHit = { page: number; before: string; match: string; after: string };

/**
 * Repair the extracted PDF text for searching: the book's font extracts its "fl"
 * and "fi" ligatures as "Ò" / "Ï" ("shufÒe", "DifÏculty"), and words hyphenated
 * at a line end ("Arti-\nfact") would otherwise never match a typed word.
 */
function cleanPageText(text: string): string {
  return text
    .replace(/Ò/g, "fl")
    .replace(/Ï/g, "fi")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ");
}

/**
 * Case/typography fold that keeps the string length (one char in, one char out)
 * so match offsets still index the display text: curly quotes and dashes match
 * their keyboard forms, and accented letters match their base letter.
 */
function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u0080-\uffff]/g, (char) => {
      const base = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return base.length === 1 ? base : char;
    });
}

function searchPages(texts: string[], query: string, limit = 80): SearchHit[] {
  const needle = foldForSearch(cleanPageText(query).trim());
  if (needle.length < 2) return [];
  const hits: SearchHit[] = [];
  texts.forEach((text, index) => {
    const cleaned = cleanPageText(text);
    const lower = foldForSearch(cleaned);
    // A case mapping that changes length would shift the offsets; then show the
    // folded text itself so the snippet still lines up with the match.
    const flat = lower.length === cleaned.length ? cleaned : lower;
    let from = 0;
    let perPage = 0;
    while (hits.length < limit && perPage < 3) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      hits.push({
        page: index + 1,
        before: flat.slice(Math.max(0, at - 48), at),
        match: flat.slice(at, at + needle.length),
        after: flat.slice(at + needle.length, at + needle.length + 64),
      });
      from = at + needle.length;
      perPage += 1;
    }
  });
  return hits;
}

/** Outline entry whose page is the last one at or before `page` (the section you are in). */
function activeOutlineKey(items: OutlineItem[], page: number, prefix = ""): string | null {
  let best: string | null = null;
  items.forEach((item, index) => {
    const key = `${prefix}${index}`;
    if (item.page !== null && item.page <= page) {
      best = key;
      const child = activeOutlineKey(item.children, page, `${key}.`);
      if (child) best = child;
    }
  });
  return best;
}

function OutlineList({
  items,
  prefix,
  activeKey,
  onPick,
}: {
  items: OutlineItem[];
  prefix: string;
  activeKey: string | null;
  onPick: (page: number) => void;
}) {
  return (
    <ul className={css.outlineList}>
      {items.map((item, index) => {
        const key = `${prefix}${index}`;
        return (
          <li key={key}>
            <button
              aria-current={activeKey === key ? "true" : undefined}
              className={css.outlineItem}
              disabled={item.page === null}
              onClick={() => item.page !== null && onPick(item.page)}
              type="button"
            >
              <span>{item.title}</span>
              {item.page !== null ? <small>{item.page}</small> : null}
            </button>
            {item.children.length ? (
              <OutlineList activeKey={activeKey} items={item.children} onPick={onPick} prefix={`${key}.`} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function RulebookReader({ onClose, initialPage }: { onClose: () => void; initialPage?: number }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [current, setCurrent] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<string[] | null>(null);
  const [textError, setTextError] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const pageCount = INDEX.pageCount;

  const goToPage = useCallback(
    (page: number, behavior: ScrollBehavior = "smooth") => {
      const target = Math.min(pageCount, Math.max(1, Math.round(page)));
      const element = pageRefs.current[target - 1];
      const scroller = scrollerRef.current;
      if (!element || !scroller) return;
      scroller.scrollTo({ top: element.offsetTop - 12, behavior });
    },
    [pageCount],
  );

  // Restore zoom + last page once, then focus the close button for keyboard users.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedZoom = readNumber(ZOOM_KEY);
    if (savedZoom && ZOOM_STEPS.includes(savedZoom)) setZoom(savedZoom);
    const start = initialPage ?? readNumber(LAST_PAGE_KEY) ?? 1;
    closeRef.current?.focus();
    if (start > 1) {
      // Wait a frame so the page boxes have their laid-out heights.
      requestAnimationFrame(() => goToPage(start, "auto"));
    }
  }, [goToPage, initialPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lazy page loading: a page's image src is set once it comes near the view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof IntersectionObserver === "undefined") {
      setLoaded(new Set(INDEX.pages.map((page) => page.n)));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries.filter((entry) => entry.isIntersecting).map((entry) => Number((entry.target as HTMLElement).dataset.page));
        if (!near.length) return;
        setLoaded((previous) => {
          if (near.every((page) => previous.has(page))) return previous;
          const next = new Set(previous);
          near.forEach((page) => next.add(page));
          return next;
        });
      },
      { root: scroller, rootMargin: PRELOAD_MARGIN },
    );
    pageRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  // Current page = the last page whose top has passed 40% of the viewport.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const mark = scroller.scrollTop + scroller.clientHeight * 0.4;
      let page = 1;
      pageRefs.current.forEach((element, index) => {
        if (element && element.offsetTop <= mark) page = index + 1;
      });
      setCurrent(page);
      writeNumber(LAST_PAGE_KEY, page);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const changeZoom = useCallback(
    (direction: 1 | -1) => {
      const index = ZOOM_STEPS.indexOf(zoom);
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index < 0 ? 3 : index) + direction))];
      if (next === zoom) return;
      const keep = current;
      setZoom(next);
      writeNumber(ZOOM_KEY, next);
      requestAnimationFrame(() => goToPage(keep, "auto"));
    },
    [current, goToPage, zoom],
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setContentsOpen(false);
    if (texts) return;
    // Reopening Search after a failed chunk load retries it.
    setTextError(false);
    import("@/data/rulebook/rulebook-text.json")
      .then((module) => setTexts((module.default ?? module) as unknown as string[]))
      .catch(() => setTextError(true));
  }, [texts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (searchOpen) setSearchOpen(false);
        else if (contentsOpen) setContentsOpen(false);
        else onClose();
        return;
      }
      const typing = event.target instanceof HTMLInputElement;
      if (typing) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToPage(current + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToPage(current - 1);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contentsOpen, current, goToPage, onClose, openSearch, searchOpen]);

  const hits = useMemo(() => (texts ? searchPages(texts, query) : []), [query, texts]);
  const activeKey = useMemo(() => activeOutlineKey(INDEX.outline, current), [current]);

  const pick = (page: number) => {
    goToPage(page);
    setContentsOpen(false);
    setSearchOpen(false);
  };

  return (
    <div aria-label="Rule book" aria-modal="true" className={css.root} role="dialog">
      <header className={css.bar}>
        <span className={css.brand}>
          <BookOpen aria-hidden size={18} /> Rule Book
        </span>
        <button
          aria-expanded={contentsOpen}
          className={css.tool}
          onClick={() => {
            setContentsOpen((open) => !open);
            setSearchOpen(false);
          }}
          title="Contents"
          type="button"
        >
          <List aria-hidden size={17} />
          <span className={css.toolLabel}>Contents</span>
        </button>
        <button aria-expanded={searchOpen} className={css.tool} onClick={openSearch} title="Search (Ctrl+F)" type="button">
          <Search aria-hidden size={17} />
          <span className={css.toolLabel}>Search</span>
        </button>
        <span className={css.spacer} />
        <button aria-label="Previous page" className={css.tool} disabled={current <= 1} onClick={() => goToPage(current - 1)} type="button">
          <ChevronLeft aria-hidden size={18} />
        </button>
        <form
          className={css.jump}
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(jumpValue);
            if (Number.isFinite(value) && value >= 1) goToPage(value);
            setJumpValue("");
          }}
        >
          <input
            aria-label="Go to page"
            inputMode="numeric"
            onChange={(event) => setJumpValue(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder={String(current)}
            value={jumpValue}
          />
          <span>/ {pageCount}</span>
        </form>
        <button aria-label="Next page" className={css.tool} disabled={current >= pageCount} onClick={() => goToPage(current + 1)} type="button">
          <ChevronRight aria-hidden size={18} />
        </button>
        <span className={css.zoomGroup}>
          <button aria-label="Zoom out" className={css.tool} disabled={zoom <= ZOOM_STEPS[0]} onClick={() => changeZoom(-1)} type="button">
            <Minus aria-hidden size={16} />
          </button>
          <span className={css.zoomValue}>{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" className={css.tool} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => changeZoom(1)} type="button">
            <Plus aria-hidden size={16} />
          </button>
        </span>
        <a
          className={css.tool}
          href={INDEX.source}
          rel="noopener noreferrer"
          target="_blank"
          title="Download the original PDF (about 43 MB)"
        >
          <ExternalLink aria-hidden size={16} />
          <span className={css.toolLabel}>PDF</span>
        </a>
        <button aria-label="Close rule book" className={`${css.tool} ${css.close}`} onClick={onClose} ref={closeRef} type="button">
          <X aria-hidden size={18} />
        </button>
      </header>

      {contentsOpen ? (
        <nav aria-label="Contents" className={css.panel}>
          <OutlineList activeKey={activeKey} items={INDEX.outline} onPick={pick} prefix="" />
        </nav>
      ) : null}

      {searchOpen ? (
        <section aria-label="Search the rule book" className={css.panel}>
          <form
            className={css.searchForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (hits[0]) pick(hits[0].page);
            }}
          >
            <Search aria-hidden size={15} />
            <input
              autoFocus
              aria-label="Search text"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules, e.g. morale, siege, level"
              value={query}
            />
          </form>
          {textError ? <p className={css.searchNote}>Search text could not be loaded.</p> : null}
          {!texts && !textError ? <p className={css.searchNote}>Loading search…</p> : null}
          {texts && query.trim().length >= 2 && hits.length === 0 ? <p className={css.searchNote}>No matches.</p> : null}
          <ol className={css.hits}>
            {hits.map((hit, index) => (
              <li key={`${hit.page}-${index}`}>
                <button className={css.hit} onClick={() => pick(hit.page)} type="button">
                  <small>p. {hit.page}</small>
                  <span>
                    …{hit.before}
                    <mark>{hit.match}</mark>
                    {hit.after}…
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className={css.scroller} ref={scrollerRef}>
        <div className={css.column} style={{ ["--rb-zoom" as string]: String(zoom) }}>
          {INDEX.pages.map((page, index) => (
            <div
              className={css.page}
              data-page={page.n}
              key={page.n}
              ref={(element) => {
                pageRefs.current[index] = element;
              }}
              style={{ aspectRatio: `${page.w} / ${page.h}` }}
            >
              {loaded.has(page.n) ? (
                <img alt={`Rule book page ${page.n}`} decoding="async" draggable={false} src={assetUrl(page.src)} />
              ) : (
                <span className={css.placeholder}>{page.n}</span>
              )}
              {loaded.has(page.n)
                ? page.links?.map((link, linkIndex) => {
                    const style = {
                      left: `${link.x * 100}%`,
                      top: `${link.y * 100}%`,
                      width: `${link.w * 100}%`,
                      height: `${link.h * 100}%`,
                    };
                    return link.page ? (
                      <button
                        aria-label={`Go to page ${link.page}`}
                        className={css.hotspot}
                        key={linkIndex}
                        onClick={() => goToPage(link.page!)}
                        style={style}
                        type="button"
                      />
                    ) : (
                      <a
                        aria-label={`Open ${link.url}`}
                        className={css.hotspot}
                        href={link.url}
                        key={linkIndex}
                        rel="noopener noreferrer"
                        style={style}
                        target="_blank"
                      />
                    );
                  })
                : null}
            </div>
          ))}
          <p className={css.footer}>
            Community rule book · rendered {INDEX.builtAt} ·{" "}
            <a href={INDEX.source} rel="noopener noreferrer" target="_blank">
              original PDF
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
