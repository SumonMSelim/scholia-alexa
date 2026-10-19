---
concept: aliasing
citation: Lecture 5, Guttag ch. 5.3
---

## Two names, one object

Assignment binds a name to an object; it does not copy the object. After warm = ["red", "yellow"] and hot = warm, both names refer to the same list. Appending through hot changes what warm shows as well. This is aliasing, and it is the main source of surprising behaviour with lists.

## Cloning to avoid side effects

To get an independent list, clone it: chill = warm[:] or list(warm). Mutations through chill then leave warm untouched. The clone is shallow, so nested lists inside are still shared unless copied in turn.

## Aliasing through function parameters

When a list is passed to a function the parameter is another alias for the same object, so a function that appends to its argument changes the caller's list. Never mutate a list while iterating over it; iterate over a clone instead.
