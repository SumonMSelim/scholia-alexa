---
concept: bisection-search
citation: Lecture 3, Guttag ch. 3.3
---

## Guess and check versus bisection

Guess-and-check tries candidates one at a time, which can be very slow when the answer space is large. Bisection search exploits order: if a function is monotonic on an interval, you can test the midpoint and discard the half that cannot contain the answer. Each step halves the search space.

## Approximating a square root

To find the square root of x, keep a low bound of 0 and a high bound of max(1, x). Set guess to the midpoint, compare guess squared with x, and move low or high to the guess accordingly. Stop when guess squared is within epsilon of x. The loop converges because the interval shrinks every iteration.

## Why it is fast

Halving the interval each time means the number of iterations grows with the logarithm of the initial interval size divided by epsilon, not linearly. Searching a space of a billion values takes about thirty steps. This logarithmic behaviour is the same idea that makes binary search on a sorted list efficient.
