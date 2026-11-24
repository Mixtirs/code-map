def clean(text):
    text = text.strip()
    while "  " in text:
        text = text.replace("  ", " ")
    return text


def render_list(items):
    lines = []
    for i, item in enumerate(items, 1):
        lines.append(f"{i}. {item}")
    return "\n".join(lines) or "(nothing to do)"


def describe(count):
    match count:
        case 0:
            return "empty"
        case 1:
            return "one item"
        case _:
            return f"{count} items"
