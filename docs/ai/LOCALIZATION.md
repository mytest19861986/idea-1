# Localization

The current localization primitive renders explicit catalog entries only. It intentionally does not translate, infer a locale, fall back to another locale, render HTML, or call an AI provider. Missing keys and mismatched placeholders are errors so delivery layers cannot silently publish a wrong-language message.
