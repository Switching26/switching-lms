import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("resolver", Path(__file__).with_name("resolve.py"))
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)
sources = Path.home() / "checkos/scratchpads/lms-intros-video"
snapshot = json.loads((Path.home() / "lms-intros-mission/bureautique/snapshot-cibles.json").read_text())


class IdentityTests(unittest.TestCase):
    def test_complete(self):
        result = resolver.resolve_targets(snapshot, sources)
        self.assertEqual(len(result), 207)
        self.assertEqual(sum("sectionId" in t for t in result), 51)

    def test_identity_changes_rejected(self):
        for field, value in [("title", "Autre titre"), ("order", 999), ("isPublished", False), ("mode", "EXERCISE"), ("app", "EXCEL")]:
            changed = copy.deepcopy(snapshot)
            lesson = next(c for c in changed["chapters"] if c["isPublished"] and c["mode"] == "LESSON")
            lesson[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                resolver.resolve_targets(changed, sources)

    def test_ambiguous_module_rejected(self):
        changed = copy.deepcopy(snapshot)
        section = copy.deepcopy(changed["sections"][0]); section["id"] = "module-double"
        changed["sections"].append(section)
        lesson = copy.deepcopy(next(c for c in changed["chapters"] if c["sectionId"] == changed["sections"][0]["id"]))
        lesson["sectionId"] = section["id"]; changed["chapters"].append(lesson)
        with self.assertRaises(ValueError):
            resolver.resolve_targets(changed, sources)


if __name__ == "__main__":
    unittest.main()
