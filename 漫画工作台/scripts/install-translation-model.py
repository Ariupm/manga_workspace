"""Run using workspace/translation-venv Python after pip install -r requirements."""
import argostranslate.package

if not any(p.from_code == "zh" and p.to_code == "en" for p in argostranslate.package.get_installed_packages()):
    argostranslate.package.update_package_index()
    package = next(p for p in argostranslate.package.get_available_packages() if p.from_code == "zh" and p.to_code == "en")
    argostranslate.package.install_from_path(package.download())
print("Argos zh -> en model installed")

# Initialize sentence splitting resources during installation, not a user request.
import argostranslate.translate
print("Translation warmup:", argostranslate.translate.translate("这是一本书。", "zh", "en"))
