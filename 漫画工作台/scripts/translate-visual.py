"""Translate Chinese prose via installed Argos zh->en model. JSON stdin/stdout."""
import contextlib
import json
import re
import sys


def main():
    payload = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        import argostranslate.translate
        languages = argostranslate.translate.get_installed_languages()
        source = next((lang for lang in languages if lang.code == "zh"), None)
        target = next((lang for lang in languages if lang.code == "en"), None)
        if source is None or target is None:
            raise RuntimeError("Argos Chinese-to-English model is not installed")
        translator = source.get_translation(target)
        glossary = payload.get("glossary", {})
        names = sorted((key for key in glossary if key), key=len, reverse=True)
        pattern = re.compile("|".join(re.escape(key) for key in names)) if names else None
        results = []
        for text in payload["texts"]:
            if not isinstance(text, str):
                raise ValueError("Translation input must contain strings")
            # Replace known proper names before sentence translation.
            if pattern:
                text = pattern.sub(lambda match: glossary[match.group()], text)
            results.append(translator.translate(text))
    json.dump({"translations": results}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
