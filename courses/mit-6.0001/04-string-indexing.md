---
concept: string-indexing
citation: Lecture 3, Guttag ch. 2.4
---

## Indexing

A string is a sequence of characters and each character has a position. Indexing starts at 0, so "hello"[0] is "h". Negative indices count from the end, so "hello"[-1] is "o". Asking for an index outside the string raises an IndexError.

## Slicing

A slice s[start:stop] returns the characters from start up to but not including stop. Omitting start means from the beginning, omitting stop means to the end, and s[::-1] reverses the string using a step of -1. Slicing never fails on out-of-range bounds; it simply clips.

## Immutability and iteration

Strings are immutable. s[0] = "y" raises a TypeError; to change a string you build a new one, for example "y" + s[1:]. You can loop over a string either by index with range(len(s)) or directly over its characters with for ch in s, which is usually clearer.
