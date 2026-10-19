---
concept: lists-and-mutation
citation: Lecture 5, Guttag ch. 5.2
---

## Lists are mutable sequences

A list is an ordered sequence written with square brackets, and unlike a tuple or a string it is mutable: you can change it in place. L[0] = 99 replaces the first element. Lists usually hold items of one type, though Python does not require it.

## Mutating methods

append adds one element to the end, extend adds every element of another list, and remove deletes the first matching value. pop removes and returns the element at an index. sort and reverse reorder the list in place. These methods return None, so writing L = L.append(x) throws away the list.

## Non-mutating operations

Concatenation with + builds a new list, as does slicing. sorted(L) returns a new sorted list and leaves L alone, in contrast to L.sort(). Knowing which operations mutate and which build a new object is the key to avoiding surprises.
