---
concept: dictionaries
citation: Lecture 6, Guttag ch. 5.6
---

## Keys and values

A dictionary maps keys to values and is written with braces: grades = {"ana": "B", "bob": "A"}. Look up with grades["ana"], add or replace with grades["cat"] = "C", and delete with del grades["bob"]. A missing key raises a KeyError; use the in operator or get with a default to check first.

## Rules for keys

Keys must be immutable and hashable, so strings, numbers and tuples work but lists do not. Values can be anything, including other dictionaries or lists. Dictionaries have no guaranteed order you should rely on when designing a program; iterate with keys(), values() or items().

## Counting and memoisation

Dictionaries make frequency counts easy: for each word, increment counts[word]. They are also the natural store for memoisation, where a recursive function such as Fibonacci remembers results it has already computed so each value is calculated only once.
