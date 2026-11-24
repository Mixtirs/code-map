"""Tiny to-do app used to test Code Map."""
import sys
from todo.store import TodoStore
from todo import formatting


def run(args):
    store = TodoStore("todos.json")
    store.load()
    if not args:
        print(formatting.render_list(store.items))
    elif args[0] == "add":
        store.add(" ".join(args[1:]))
        store.save()
    else:
        print("Unknown command")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))
