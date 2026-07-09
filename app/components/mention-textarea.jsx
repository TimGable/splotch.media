"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFollowMentionSuggestions } from "@/lib/hooks/use-follow-mention-suggestions";

const WORD_CHAR_PATTERN = /[a-z0-9_]/i;
const QUERY_PATTERN = /^[a-z0-9_]*$/i;
const TRAILING_SAFE_PATTERN = /^[\s)\]}.,!?]$/;

function normalizeValue(value) {
  return typeof value === "string" ? value : value ?? "";
}

function findMentionTrigger(value, cursor) {
  const normalizedCursor = Math.max(
    0,
    Math.min(typeof cursor === "number" ? cursor : value.length, value.length),
  );
  const prefix = value.slice(0, normalizedCursor);
  const atIndex = prefix.lastIndexOf("@");

  if (atIndex === -1) {
    return null;
  }

  if (atIndex > 0) {
    const charBefore = prefix.charAt(atIndex - 1);
    if (WORD_CHAR_PATTERN.test(charBefore)) {
      return null;
    }
  }

  const query = prefix.slice(atIndex + 1);
  if (!QUERY_PATTERN.test(query) || query.length > 32) {
    return null;
  }

  return {
    start: atIndex,
    end: normalizedCursor,
    query,
  };
}

export function MentionTextarea({
  value,
  onValueChange,
  wrapperClassName = "",
  textareaClassName = "",
  suggestionsLabel = "mention someone you follow",
  ...textareaProps
}) {
  const textareaRef = useRef(null);
  const [activeMention, setActiveMention] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null);
  const {
    suggestions,
    loading,
    fetchSuggestions,
    clearSuggestions,
  } = useFollowMentionSuggestions();

  const textValue = useMemo(() => normalizeValue(value), [value]);

  const closeDropdown = useCallback(() => {
    setActiveMention(null);
    setIsDropdownOpen(false);
    setMentionQuery(null);
    setHighlightedIndex(0);
    clearSuggestions();
  }, [clearSuggestions]);

  const triggerMentionSearch = useCallback(
    (nextValue, cursorPosition) => {
      // Mentions are cursor-aware, so editing an old @name behaves the same as
      // typing a new one at the end of the textarea.
      const trigger = findMentionTrigger(nextValue, cursorPosition);
      if (!trigger) {
        closeDropdown();
        return;
      }

      setActiveMention({
        start: trigger.start,
        end: trigger.end,
      });
      setMentionQuery(trigger.query);
      setIsDropdownOpen(true);
      setHighlightedIndex(0);
    },
    [closeDropdown],
  );

  useEffect(() => {
    if (mentionQuery === null) {
      return;
    }

    const handle = setTimeout(() => {
      fetchSuggestions(mentionQuery);
    }, 150);

    return () => {
      clearTimeout(handle);
    };
  }, [mentionQuery, fetchSuggestions]);

  const handleTextareaChange = useCallback(
    (event) => {
      const nextValue = event.target.value;
      onValueChange?.(nextValue);
      triggerMentionSearch(nextValue, event.target.selectionStart ?? nextValue.length);
    },
    [onValueChange, triggerMentionSearch],
  );

  const handleTextareaSelect = useCallback(
    (event) => {
      triggerMentionSearch(event.target.value, event.target.selectionStart ?? 0);
    },
    [triggerMentionSearch],
  );

  const insertSuggestion = useCallback(
    (suggestion) => {
      if (!textareaRef.current || !activeMention) {
        return;
      }

      const currentValue = textValue;
      const before = currentValue.slice(0, activeMention.start);
      const after = currentValue.slice(activeMention.end ?? activeMention.start);
      const mentionText = `@${suggestion.username}`;
      const needsSpace =
        after.length === 0 || !TRAILING_SAFE_PATTERN.test(after[0]) ? " " : "";

      const nextValue = `${before}${mentionText}${needsSpace}${after}`;
      onValueChange?.(nextValue);

      // React updates the value first; then we put the caret after the inserted
      // mention so the composer feels like a normal text editor.
      requestAnimationFrame(() => {
        if (!textareaRef.current) {
          return;
        }
        const cursorPosition =
          before.length + mentionText.length + (needsSpace ? 1 : 0);
        textareaRef.current.selectionStart = cursorPosition;
        textareaRef.current.selectionEnd = cursorPosition;
        textareaRef.current.focus();
      });

      closeDropdown();
    },
    [activeMention, closeDropdown, onValueChange, textValue],
  );

  const activeSuggestionIndex =
    suggestions.length > 0
      ? Math.min(highlightedIndex, suggestions.length - 1)
      : 0;

  const handleKeyDown = useCallback(
    (event) => {
      if (!isDropdownOpen) {
        return;
      }

      if (event.key === "ArrowDown") {
        if (suggestions.length === 0) {
          return;
        }
        event.preventDefault();
        setHighlightedIndex((current) => (current + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        if (suggestions.length === 0) {
          return;
        }
        event.preventDefault();
        setHighlightedIndex((current) =>
          (current - 1 + suggestions.length) % suggestions.length,
        );
      } else if (event.key === "Enter") {
        if (suggestions[activeSuggestionIndex]) {
          event.preventDefault();
          event.stopPropagation();
          insertSuggestion(suggestions[activeSuggestionIndex]);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
      }
    },
    [isDropdownOpen, suggestions, activeSuggestionIndex, insertSuggestion, closeDropdown],
  );

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    triggerMentionSearch(
      textareaRef.current.value,
      textareaRef.current.selectionStart ?? textareaRef.current.value.length,
    );
  }, [triggerMentionSearch]);

  const dropdownVisible =
    isDropdownOpen && (loading || mentionQuery !== null || suggestions.length > 0);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <textarea
        ref={textareaRef}
        value={textValue}
        onChange={handleTextareaChange}
        onSelect={handleTextareaSelect}
        onKeyDown={handleKeyDown}
        className={textareaClassName}
        {...textareaProps}
      />

      {dropdownVisible ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto border border-white/25 bg-black/95 text-sm shadow-xl">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-gray-500">
            {suggestionsLabel}
          </div>

          {loading ? (
            <p className="px-3 py-2 text-xs text-gray-400">loading...</p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">
              {mentionQuery ? "no matching follows." : "you aren't following anyone yet."}
            </p>
          ) : (
            suggestions.map((suggestion, index) => {
              const isActive = index === activeSuggestionIndex;
              return (
                <button
                  key={suggestion.userId}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertSuggestion(suggestion);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-white/15 text-white" : "text-gray-200 hover:bg-white/10"
                  }`}
                >
                  <span className="truncate">{suggestion.displayName || suggestion.username}</span>
                  <span className="ml-3 text-xs text-gray-400">@{suggestion.username}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
