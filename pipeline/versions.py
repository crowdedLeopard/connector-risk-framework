"""Version numbers for the published method and data contract.

METHOD_VERSION follows semantic versioning for the decision logic and its rules:
  major: a change that can turn an existing decision into a different treatment,
  minor: new traits, controls or presets that leave existing decisions alone,
  patch: wording, presentation and fixes that do not change any decision.
SCHEMA_VERSION covers the published JSON files described in schema/. A major
change removes or renames a field; a minor change only adds fields.
Record every change in CHANGELOG.md.
"""
METHOD_VERSION = "1.0.0"
SCHEMA_VERSION = "1.0"
