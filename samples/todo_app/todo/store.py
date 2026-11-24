import json
from .formatting import clean


class TodoStore:
    def __init__(self, path):
        self.path = path
        self.items = []

    def load(self):
        try:
            with open(self.path) as f:
                self.items = json.load(f)
        except FileNotFoundError:
            self.items = []
        finally:
            self._log("loaded")

    def add(self, text):
        text = clean(text)
        for item in self.items:
            if item == text:
                return
        else:
            self.items.append(text)

    def save(self):
        with open(self.path, "w") as f:
            json.dump(self.items, f)
        self._log("saved")

    def _log(self, what):
        print(f"[store] {what} {len(self.items)} items")
