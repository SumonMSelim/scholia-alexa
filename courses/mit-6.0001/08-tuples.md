---
concept: tuples
citation: Lecture 5, Guttag ch. 5.1
---

## What a tuple is

A tuple is an ordered, immutable sequence written with parentheses, for example (1, "two", 3.0). Elements can have different types. Because tuples are immutable you cannot append to or change them; operations like concatenation produce a new tuple. A one-element tuple needs a trailing comma: (5,) not (5).

## Indexing, slicing and iteration

Tuples support the same indexing and slicing as strings: t[0], t[-1], t[1:3]. You can iterate over a tuple with a for loop and test membership with in. len gives the number of elements.

## Swapping and returning several values

Tuples are the idiomatic way to return more than one value from a function: return (quotient, remainder) and the caller writes q, r = divide(a, b). This unpacking also gives a one-line swap, x, y = y, x, with no temporary variable.
