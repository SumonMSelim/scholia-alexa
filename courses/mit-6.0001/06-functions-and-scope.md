---
concept: functions-and-scope
citation: Lecture 4, Guttag ch. 4.1
---

## Defining and calling functions

A function packages a computation behind a name so it can be reused and tested on its own. def introduces the function, the parameters are placeholders for the arguments passed in the call, and the body runs each time the function is invoked. The docstring right under def explains what the function expects and returns.

## return and None

return hands a value back to the caller and ends the function immediately. A function without a return statement, or one that falls off the end, returns None. Printing inside a function is not the same as returning: print shows something to the user, return gives a value the program can keep computing with.

## Scope and environments

Each function call creates a new scope, or environment, that holds its parameters and local variables. Names assigned inside the function are local and disappear when the call ends. A function can read a global name it does not assign, but assigning to a name inside a function makes it local. This is why a variable changed inside a function does not change the caller's variable.
