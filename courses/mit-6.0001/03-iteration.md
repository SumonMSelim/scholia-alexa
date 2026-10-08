---
concept: iteration
citation: Lecture 2, Guttag ch. 2.3
---

## while loops

A while loop repeats its body as long as its condition is True. The body must change something the condition depends on, otherwise the loop never terminates. A typical pattern keeps a counter: initialise it before the loop, test it in the condition, and update it inside the body. Forgetting the update is the usual cause of an infinite loop.

## for loops and range

A for loop iterates over a sequence and runs its body once per item. range(n) yields the integers 0 up to but not including n; range(start, stop, step) lets you pick where to begin and how far to jump. Use a for loop when the number of iterations is known in advance and a while loop when it depends on what happens inside the body.

## break and loop control

The break statement exits the innermost enclosing loop immediately, skipping any remaining iterations. It is useful for searching: iterate until a match is found, then break. Code after the loop runs whether the loop ended by exhausting its sequence or by break.
